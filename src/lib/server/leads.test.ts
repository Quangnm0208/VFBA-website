import { describe, expect, it, vi } from 'vitest';
import { handleLead, type LeadDeps } from './leads';
import { createLogger } from './log';
import { LIMITS } from './leads';
import { hashIp } from './hash';
import type { LeadRecord, LeadStore } from './store';

const ORIGIN = 'https://www.vbfa.example';
const NOW = Date.parse('2026-10-22T10:00:00Z');

function fakeStore(): LeadStore & { rows: LeadRecord[]; attempts: Array<{ hash: string; kind: string }>; preload(hash: string, attempts: number): void } {
  const rows: LeadRecord[] = [];
  const attempts: Array<{ hash: string; kind: string }> = [];
  return {
    rows,
    attempts,
    preload: (hash, n) => { for (let i = 0; i < n; i++) attempts.push({ hash, kind: 'newsletter' }); },
    // Same decision as public.register_attempt (see supabase/migrations/0002_form_throttle.sql).
    registerAttempt: async (hash, kind, limits) => {
      attempts.push({ hash, kind });
      if (attempts.filter((a) => a.hash === hash).length > limits.maxAttempts) return 'attempts';
      if (rows.filter((r) => r.ip_hash === hash).length >= limits.maxLeads) return 'leads';
      return 'ok';
    },
    insert: async (record) => {
      if (record.kind === 'newsletter' && rows.some((r) => r.kind === 'newsletter' && r.email === record.email)) return 'duplicate';
      rows.push(record);
      return 'created';
    },
  };
}

function deps(overrides: Partial<LeadDeps> = {}) {
  const lines: string[] = [];
  const store = fakeStore();
  const d: LeadDeps = {
    store,
    log: createLogger('req-1', (l) => lines.push(l)),
    now: () => NOW,
    ipSalt: 'test-salt',
    ...overrides,
  };
  return { d, lines, store: d.store as ReturnType<typeof fakeStore> };
}

const join = {
  kind: 'membership',
  name: 'Nguyễn Văn A',
  company: 'Công ty ABC',
  email: 'Nguyen.A@Example.COM ',
  phone: '(+84) 912 345 678',
  interest: 'Quan tâm hội viên',
  message: 'Xin chào',
  consent: true,
  consentVersion: 'join-v2',
  website: '',
  openedAt: NOW - 20_000,
  sourcePath: '/',
};

function post(body: unknown, init: { origin?: string | null; type?: string; method?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': init.type ?? 'application/json' };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return new Request(`${ORIGIN}/api/join/`, { method: init.method ?? 'POST', headers, body: init.method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}
const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

describe('handleLead — membership', () => {
  it('stores a valid lead, normalising the email and hashing the address', async () => {
    const { d, store } = deps();
    const res = await handleLead(post(join), 'membership', '203.0.113.7', d);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ kind: 'membership', email: 'nguyen.a@example.com', consent: true, consent_text_version: 'join-v2' });
    expect(store.rows[0]!.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(store.rows[0])).not.toContain('203.0.113.7');
  });

  it('rejects other origins, wrong content type and oversized bodies', async () => {
    const { d } = deps();
    expect((await handleLead(post(join, { origin: 'https://evil.example' }), 'membership', undefined, d)).status).toBe(403);
    expect((await handleLead(post(join, { origin: null }), 'membership', undefined, d)).status).toBe(403);
    expect((await handleLead(post(join, { type: 'text/plain' }), 'membership', undefined, d)).status).toBe(415);
    expect((await handleLead(post({ ...join, message: 'x'.repeat(9000) }), 'membership', undefined, d)).status).toBe(413);
    expect((await handleLead(post(join, { method: 'GET' }), 'membership', undefined, d)).status).toBe(405);
  });

  it('accepts an extra configured origin', async () => {
    const { d } = deps({ allowedOrigins: ['https://vbfa.vn'] });
    expect((await handleLead(post(join, { origin: 'https://vbfa.vn' }), 'membership', undefined, d)).status).toBe(200);
  });

  it('returns Vietnamese field errors for invalid input', async () => {
    const { d, store } = deps();
    const res = await handleLead(post({ ...join, email: 'not-an-email', name: '', consent: false }), 'membership', undefined, d);
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.code).toBe('invalid');
    expect(body.fields).toMatchObject({ email: 'Email không hợp lệ.', name: 'Vui lòng nhập họ và tên.' });
    expect(store.rows).toHaveLength(0);
  });

  it('silently drops honeypot hits and instant submissions (no signal to bots, nothing stored)', async () => {
    const { d, store } = deps();
    const bot = await handleLead(post({ ...join, website: 'http://spam.example' }), 'membership', undefined, d);
    const fast = await handleLead(post({ ...join, openedAt: NOW - 300 }), 'membership', undefined, d);
    expect([bot.status, fast.status]).toEqual([200, 200]);
    expect(await json(bot)).toEqual({ ok: true });
    expect(store.rows).toHaveLength(0);
  });

  it('fails closed (503) when Supabase is not configured', async () => {
    const { d } = deps({ store: null });
    const res = await handleLead(post(join), 'membership', undefined, d);
    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe('unavailable');
  });

  it('fails closed (503) when the address-hashing salt is missing, instead of limiting with a weaker key', async () => {
    const { d, store } = deps({ ipSalt: undefined });
    const res = await handleLead(post(join), 'membership', '203.0.113.7', d);
    expect(res.status).toBe(503);
    expect(store.rows).toHaveLength(0);
    expect(store.attempts).toHaveLength(0);
  });

  it('limits stored leads per hashed address (5 per window) and leaves other addresses alone', async () => {
    const { d, store } = deps();
    const sub = (n: number) => ({ kind: 'newsletter', email: `n${n}@b.vn`, website: '', openedAt: NOW - 20_000 });
    for (let i = 0; i < 5; i++) expect((await handleLead(post(sub(i)), 'newsletter', '203.0.113.7', d)).status).toBe(200);
    const sixth = await handleLead(post(sub(6)), 'newsletter', '203.0.113.7', d);
    expect(sixth.status).toBe(429);
    expect((await json(sixth)).code).toBe('rate_limited');
    expect((await handleLead(post(sub(7)), 'newsletter', '203.0.113.8', d)).status).toBe(200);
    expect(store.rows).toHaveLength(6);
  });

  it('counts attempts that store nothing: repeated duplicates are throttled too', async () => {
    const { d, store } = deps();
    const dup = { kind: 'newsletter', email: 'same@b.vn', website: '', openedAt: NOW - 20_000 };
    const statuses: number[] = [];
    for (let i = 0; i < LIMITS.maxAttempts + 2; i++) statuses.push((await handleLead(post(dup), 'newsletter', '203.0.113.9', d)).status);
    expect(statuses.slice(0, LIMITS.maxAttempts).every((x) => x === 200)).toBe(true);
    expect(statuses.slice(LIMITS.maxAttempts)).toEqual([429, 429]);
    expect(store.rows).toHaveLength(1);
  });

  it('counts failed captchas, and does so BEFORE calling the captcha provider', async () => {
    const bad = vi.fn(async () => new Response(JSON.stringify({ success: false })));
    const { d, store } = deps({ turnstileSecret: 's', fetchImpl: bad as unknown as typeof fetch });
    const hash = await hashIp('203.0.113.9', 'test-salt');
    store.preload(hash, LIMITS.maxAttempts);
    const res = await handleLead(post({ ...join, turnstileToken: 't' }), 'membership', '203.0.113.9', d);
    expect(res.status).toBe(429);
    expect(bad).not.toHaveBeenCalled();
  });

  it('gives requests without a detectable address one shared budget instead of an exemption', async () => {
    const { d, store } = deps();
    const unknownHash = await hashIp('unknown-address', 'test-salt');
    for (let i = 0; i < LIMITS.maxAttempts; i++) await handleLead(post({ ...join, email: `u${i}@b.vn` }), 'membership', undefined, d);
    expect(store.attempts.every((a) => a.hash === unknownHash)).toBe(true);
    expect((await handleLead(post(join), 'membership', undefined, d)).status).toBe(429);
  });

  it('stores only the path of the source page and plain-text allow-listed UTM values', async () => {
    const { d, store } = deps();
    const res = await handleLead(post({ ...join, sourcePath: '/tin-tuc/?email=a@b.vn&token=abc#frag', utm: { utm_source: 'newsletter', utm_medium: 'email<script>', utm_campaign: 'Thu hoạch 2026', utm_term: 'nope', gclid: 'x' } }), 'membership', '203.0.113.7', d);
    expect(res.status).toBe(200);
    expect(store.rows[0]!.source_path).toBe('/tin-tuc/');
    expect(store.rows[0]!.utm).toEqual({ utm_source: 'newsletter', utm_campaign: 'Thu hoạch 2026' });
  });

  it('requires a valid Turnstile token when a secret is configured', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    const bad = vi.fn(async () => new Response(JSON.stringify({ success: false })));
    const missing = await handleLead(post(join), 'membership', undefined, deps({ turnstileSecret: 's' }).d);
    expect(missing.status).toBe(400);
    const rejected = await handleLead(post({ ...join, turnstileToken: 't' }), 'membership', undefined, deps({ turnstileSecret: 's', fetchImpl: bad as unknown as typeof fetch }).d);
    expect(rejected.status).toBe(400);
    expect((await json(rejected)).code).toBe('captcha');
    const accepted = await handleLead(post({ ...join, turnstileToken: 't' }), 'membership', undefined, deps({ turnstileSecret: 's', fetchImpl: ok as unknown as typeof fetch }).d);
    expect(accepted.status).toBe(200);
  });

  it('turns a failing rate-limit lookup into 503 (never a silent pass)', async () => {
    const broken: LeadStore = { registerAttempt: async () => { throw new Error('registerAttempt:57014'); }, insert: async () => 'created' };
    const { d, lines } = deps({ store: broken });
    const res = await handleLead(post(join), 'membership', '203.0.113.7', d);
    expect(res.status).toBe(503);
    expect(lines.join('\n')).toContain('lead.store_failed');
  });

  it('turns a storage failure into 503 without leaking details', async () => {
    const broken: LeadStore = { registerAttempt: async () => 'ok', insert: async () => { throw new Error('insert:42P01'); } };
    const { d, lines } = deps({ store: broken });
    const res = await handleLead(post(join), 'membership', undefined, d);
    expect(res.status).toBe(503);
    expect(JSON.stringify(await json(res))).not.toContain('42P01');
    expect(lines.join('\n')).toContain('lead.store_failed');
  });
});

describe('handleLead — newsletter', () => {
  const sub = (email: string) => ({ kind: 'newsletter', email, website: '', openedAt: NOW - 20_000, sourcePath: '/tin-tuc/' });

  it('stores an address and answers a repeat exactly the same way', async () => {
    const { d, store } = deps();
    const first = await handleLead(post(sub('a@b.vn')), 'newsletter', undefined, d);
    const again = await handleLead(post(sub('A@B.vn')), 'newsletter', undefined, d);
    expect([first.status, again.status]).toEqual([200, 200]);
    expect(await json(first)).toEqual(await json(again));
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ kind: 'newsletter', name: null, consent_text_version: 'newsletter-action-v1' });
  });

  it('requires a valid Turnstile token on the newsletter too when a secret is configured', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    const missing = await handleLead(post(sub('x@y.vn')), 'newsletter', undefined, deps({ turnstileSecret: 's' }).d);
    expect(missing.status).toBe(400);
    expect((await json(missing)).code).toBe('captcha');
    const { d, store } = deps({ turnstileSecret: 's', fetchImpl: ok as unknown as typeof fetch });
    expect((await handleLead(post({ ...sub('x@y.vn'), turnstileToken: 't' }), 'newsletter', undefined, d)).status).toBe(200);
    expect(store.rows).toHaveLength(1);
  });
});

describe('logging boundary', () => {
  it('never writes customer data to the technical log', async () => {
    const { d, lines } = deps();
    await handleLead(post(join), 'membership', '203.0.113.7', d);
    await handleLead(post({ ...join, email: 'bad' }), 'membership', '203.0.113.7', d);
    const all = lines.join('\n');
    for (const secret of ['nguyen.a@example.com', 'Nguyễn Văn A', 'Công ty ABC', '912 345 678', 'Xin chào', '203.0.113.7']) {
      expect(all).not.toContain(secret);
    }
    expect(all).toContain('lead.stored');
  });

  it('does not log the visitor address or its hash either', async () => {
    const { d, lines } = deps();
    await handleLead(post(join), 'membership', '203.0.113.7', d);
    const hash = await hashIp('203.0.113.7', 'test-salt');
    expect(lines.join('\n')).not.toContain(hash);
  });
});
