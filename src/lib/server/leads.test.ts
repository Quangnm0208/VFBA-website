import { describe, expect, it, vi } from 'vitest';
import { handleLead, type LeadDeps } from './leads';
import { createLogger } from './log';
import type { LeadRecord, LeadStore } from './store';

const ORIGIN = 'https://www.vbfa.example';
const NOW = Date.parse('2026-10-22T10:00:00Z');

function fakeStore(initialRecent = 0): LeadStore & { rows: LeadRecord[] } {
  const rows: LeadRecord[] = [];
  return {
    rows,
    countRecent: async () => initialRecent + rows.length,
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

  it('rate limits by hashed address', async () => {
    const { d } = deps({ store: fakeStore(5) });
    const res = await handleLead(post(join), 'membership', '203.0.113.7', d);
    expect(res.status).toBe(429);
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

  it('turns a storage failure into 503 without leaking details', async () => {
    const broken: LeadStore = { countRecent: async () => 0, insert: async () => { throw new Error('insert:42P01'); } };
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

  it('does not demand a captcha token (the newsletter band has no widget)', async () => {
    const { d } = deps({ turnstileSecret: 's' });
    expect((await handleLead(post(sub('x@y.vn')), 'newsletter', undefined, d)).status).toBe(200);
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
});
