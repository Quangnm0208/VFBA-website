import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { captureLogs, createTestDatabase, pgliteStore } from '../test-support';
import { handlePortal, PORTAL_PAGE_SIZE } from './handler';
import type { IdentityVerifier, SanityIdentity, VerifyResult } from './identity';

/**
 * The Admin Portal's CRM API against the REAL SQL functions (PGlite built from the migrations, 0009 included) and a fake
 * identity verifier. Real here: request checks, authorization order, binding, scope / IDOR, workflow, notes, audit, logs.
 * Not real here: Sanity itself (identity.test.ts pins the shapes of its answers; the live probe and the Owner's own sign-in
 * cover the real service).
 */
const ORIGIN = 'https://admin.beta.example';
const identity = (n: string, email: string): SanityIdentity => ({ sanityUserId: `s-${n}`, email, provider: 'google', roles: ['editor'] });
const ADMIN = identity('admin', 'admin@vbfa.test');
const STAFF = identity('staff', 'staff@vbfa.test');
const NEWS = identity('news', 'news@vbfa.test');
const OUTSIDER = identity('outsider', 'outsider@vbfa.test'); // a real Sanity member who is NOT on the CRM allowlist
const tokens = new Map<string, VerifyResult>();
const issue = (token: string, who: SanityIdentity) => {
  tokens.set(token, { ok: true, identity: who });
  return token;
};
const T = {
  admin: 'token-admin-0123456789abcdef',
  staff: 'token-staff-0123456789abcdef',
  news: 'token-news-0123456789abcdef',
  outsider: 'token-outsider-0123456789abcdef',
};

let db: PGlite;
let logs = captureLogs();
let verifierCalls = 0;
const verifier: IdentityVerifier = {
  async verify(token) {
    verifierCalls++;
    return tokens.get(token) ?? { ok: false, reason: 'invalid' };
  },
};

async function call(op: string, params: Record<string, unknown> = {}, token: string | null = T.staff, init: { method?: string; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN, 'sec-fetch-site': 'same-origin', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers };
  const request = new Request(`${ORIGIN}/api/portal`, { method: init.method ?? 'POST', headers, body: (init.method ?? 'POST') === 'POST' ? (init.raw ?? JSON.stringify({ op, ...params })) : undefined });
  const response = await handlePortal(request, { store: pgliteStore(db), identity: verifier, log: logs.log });
  const text = await response.text();
  let body: Record<string, any> = {};
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, headers: response.headers, text, body };
}
const open = async (token: string) => (await call('session', {}, token)).status;

async function lead(over: Record<string, unknown> = {}): Promise<string> {
  const row = { kind: 'membership', name: 'Nguyễn Văn A', company: 'ABC', email: `l${Math.random().toString(36).slice(2, 10)}@lead.test`, consent: true, consent_text_version: 'join-v2', source_path: '/', ...over };
  const keys = Object.keys(row);
  return (await db.query<{ id: string }>(`insert into public.website_leads (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(row))).rows[0]!.id;
}
const audit = async (action: string) => (await db.query<{ actor_email: string | null; lead_id: string | null; detail: Record<string, unknown> }>('select actor_email, lead_id, detail from public.crm_audit_log where action = $1 order by id', [action])).rows;
const dbStatus = async (id: string) => (await db.query<{ status: string }>('select status from public.website_leads where id = $1', [id])).rows[0]!.status;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into public.crm_staff (email, role, created_by) values ('${ADMIN.email}', 'admin', 'test'), ('${STAFF.email}', 'staff', 'test');
    insert into public.crm_staff (email, role, kinds, created_by) values ('${NEWS.email}', 'staff', array['newsletter'], 'test');`);
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  tokens.clear();
  issue(T.admin, ADMIN);
  issue(T.staff, STAFF);
  issue(T.news, NEWS);
  issue(T.outsider, OUTSIDER);
  logs = captureLogs();
  verifierCalls = 0;
});

describe('request checks, before and without any data', () => {
  it('accepts only POST', async () => {
    const r = await call('session', {}, T.staff, { method: 'GET' });
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST');
    for (const method of ['PUT', 'DELETE', 'PATCH']) expect((await call('session', {}, T.staff, { method })).status, method).toBe(405);
  });

  it('refuses a foreign Origin and a cross-site Fetch Metadata value', async () => {
    expect((await call('session', {}, T.staff, { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call('session', {}, T.staff, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await call('session', {}, T.staff, { headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    expect(verifierCalls).toBe(0);
  });

  it('wants JSON, a bearer token, a sane body and a known operation', async () => {
    expect((await call('session', {}, T.staff, { headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await call('session', {}, T.staff, { headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status).toBe(415);
    expect((await call('session', {}, null)).status).toBe(401);
    expect((await call('session', {}, T.staff, { headers: { authorization: `Basic ${T.staff}` } })).status).toBe(401);
    expect((await call('session', {}, T.staff, { headers: { authorization: `Bearer ${T.staff} extra` } })).status).toBe(401);
    expect((await call('session', {}, T.staff, { raw: '{not json' })).status).toBe(400);
    expect((await call('session', {}, T.staff, { raw: '[1,2]' })).status).toBe(400);
    expect((await call('session', {}, T.staff, { raw: JSON.stringify({ op: 'session', pad: 'x'.repeat(40_000) }) })).status).toBe(413);
    await open(T.staff);
    expect((await call('nope', {}, T.staff)).body).toEqual({ ok: false, code: 'unknown_op' });
    expect((await call('leads.list; drop table', {}, T.staff)).body.code).toBe('unknown_op');
  });

  it('sends no-store, nosniff and noindex on every answer, errors included', async () => {
    for (const r of [await call('session'), await call('session', {}, null), await call('session', {}, 'unknown-token-0123456789'), await call('nope')]) {
      expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('x-robots-tag')).toContain('noindex');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
      expect(r.headers.get('content-type')).toContain('application/json');
    }
  });
});

describe('who is calling (identity and allowlist)', () => {
  it('answers 401 for a token Sanity does not know and 503 when Sanity is down, never 200', async () => {
    expect((await call('leads.list', {}, 'unknown-token-0123456789')).status).toBe(401);
    tokens.set('down-token-0123456789abcd', { ok: false, reason: 'unavailable' });
    const r = await call('leads.list', {}, 'down-token-0123456789abcd');
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBe('5');
  });

  it('answers 403 for a verified identity that is a robot, has no e-mail or is not a member of the project', async () => {
    for (const reason of ['robot', 'no_email', 'not_member'] as const) {
      tokens.set(`bad-${reason}-0123456789abcdef`, { ok: false, reason });
      const r = await call('session', {}, `bad-${reason}-0123456789abcdef`);
      expect(r.status, reason).toBe(403);
      expect(r.body).toEqual({ ok: false, code: 'not_allowed' });
    }
  });

  it('refuses a real Sanity member who is not on the allowlist, on every operation, and leaves one audit entry', async () => {
    await lead({ email: 'private.person@lead.test' });
    const first = await call('session', {}, T.outsider);
    expect(first.status).toBe(403);
    expect(first.body).toEqual({ ok: false, code: 'not_staff' });
    for (const op of ['leads.list', 'leads.get', 'staff.list']) {
      const r = await call(op, { id: '00000000-0000-4000-8000-000000000001' }, T.outsider);
      expect(r.status, op).toBe(403);
      expect(r.text, op).not.toContain('private.person');
    }
    const denied = (await audit('denied')).filter((r) => r.actor_email === OUTSIDER.email);
    expect(denied).toHaveLength(1); // only `session` writes the trail: no flooding
    expect(denied[0]!.detail).toEqual({ provider: 'sanity', reason: 'not_staff' });
  });

  it('needs `session` before anything else: whoami never binds a first sign-in', async () => {
    await db.exec(`insert into public.crm_staff (email, role, created_by) values ('fresh@vbfa.test', 'staff', 'test')`);
    const fresh = identity('fresh', 'fresh@vbfa.test');
    issue('token-fresh-0123456789abcdef', fresh);
    expect((await call('leads.list', {}, 'token-fresh-0123456789abcdef')).status).toBe(403);
    const s = await call('session', {}, 'token-fresh-0123456789abcdef');
    expect(s.status).toBe(200);
    expect(s.body.me).toEqual({ email: 'fresh@vbfa.test', role: 'staff', kinds: ['membership', 'newsletter', 'contact'] });
    expect((await call('leads.list', {}, 'token-fresh-0123456789abcdef')).status).toBe(200);
    const bound = (await db.query<{ sanity_user_id: string; user_id: string }>("select sanity_user_id, user_id::text from public.crm_staff where email = 'fresh@vbfa.test'")).rows[0]!;
    expect(bound.sanity_user_id).toBe('s-fresh');
    expect(bound.user_id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await audit('login')).some((r) => r.actor_email === 'fresh@vbfa.test' && r.detail.provider === 'sanity' && r.detail.bound === true)).toBe(true);
  });

  it('refuses a second Sanity user with a bound person\'s e-mail until an administrator resets the binding', async () => {
    expect(await open(T.staff)).toBe(200);
    const impostor = identity('impostor', STAFF.email);
    issue('token-impostor-0123456789abcdef', impostor);
    expect((await call('session', {}, 'token-impostor-0123456789abcdef')).status).toBe(403);
    expect((await call('leads.list', {}, 'token-impostor-0123456789abcdef')).status).toBe(403);
    expect((await audit('login_denied')).at(-1)?.detail).toMatchObject({ reason: 'binding_mismatch', provider: 'sanity' });
    expect(await open(T.admin)).toBe(200);
    expect((await call('staff.upsert', { email: STAFF.email, role: 'staff', kinds: ['membership', 'newsletter', 'contact'], reset: true }, T.admin)).body).toEqual({ ok: true, result: 'updated' });
    expect((await call('leads.list', {}, T.staff)).status).toBe(403); // the old person is out until they sign in again...
    expect((await call('session', {}, 'token-impostor-0123456789abcdef')).status).toBe(200); // ...and the new binding is accepted
    // restore the fixture for the next tests
    await call('staff.upsert', { email: STAFF.email, role: 'staff', kinds: ['membership', 'newsletter', 'contact'], reset: true }, T.admin);
    expect(await open(T.staff)).toBe(200);
  });

  it('stops the same second when an administrator deactivates the person (no session to revoke)', async () => {
    await db.exec(`insert into public.crm_staff (email, role, created_by) values ('leaver@vbfa.test', 'staff', 'test')`);
    issue('token-leaver-0123456789abcdef', identity('leaver', 'leaver@vbfa.test'));
    expect(await open('token-leaver-0123456789abcdef')).toBe(200);
    expect((await call('leads.list', {}, 'token-leaver-0123456789abcdef')).status).toBe(200);
    expect(await open(T.admin)).toBe(200);
    expect((await call('staff.setActive', { email: 'leaver@vbfa.test', active: false }, T.admin)).body).toEqual({ ok: true, result: 'ok' });
    expect((await call('leads.list', {}, 'token-leaver-0123456789abcdef')).status).toBe(403);
    expect((await call('session', {}, 'token-leaver-0123456789abcdef')).status).toBe(403);
  });
});

describe('Lead Inbox', () => {
  beforeEach(async () => {
    await open(T.admin);
    await open(T.staff);
    await open(T.news);
  });

  it('lists, filters, searches (with wildcard characters taken literally) and paginates', async () => {
    await db.exec('delete from public.website_leads');
    for (let i = 0; i < 30; i++) await lead({ name: `Khách ${String(i).padStart(2, '0')}`, email: `page${i}@lead.test`, kind: i % 3 === 0 ? 'newsletter' : 'membership' });
    await lead({ name: '100% đồng ý', email: 'percent@lead.test' });
    const all = await call('leads.list', {});
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ ok: true, total: 31, page: 1, pageSize: PORTAL_PAGE_SIZE, me: { role: 'staff' } });
    expect(all.body.rows).toHaveLength(PORTAL_PAGE_SIZE);
    expect((await call('leads.list', { page: 2 })).body.rows).toHaveLength(31 - PORTAL_PAGE_SIZE);
    expect((await call('leads.list', { kind: 'newsletter' })).body.total).toBe(10);
    expect((await call('leads.list', { q: 'page7@' })).body.total).toBe(1);
    expect((await call('leads.list', { q: '100%' })).body.total).toBe(1);
    expect((await call('leads.list', { q: '%' })).body.total).toBe(1); // a lone % must not match everything
    expect((await call('leads.list', { status: 'closed' })).body.total).toBe(0);
    expect((await call('leads.list', { from: '2999-01-01' })).body.total).toBe(0);
    expect((await call('leads.list', { from: 'not-a-date', to: '2026-13-45', status: 'deleted', kind: 'bogus', page: -4 })).body.total).toBe(31); // junk filters are ignored, never an error
  });

  it('keeps people inside their scope: a newsletter-only person never sees, reads or changes a membership lead (IDOR)', async () => {
    await db.exec('delete from public.website_leads');
    const member = await lead({ kind: 'membership', email: 'member.secret@lead.test' });
    const newsletter = await lead({ kind: 'newsletter', email: 'news.subscriber@lead.test', name: null, company: null });
    const list = await call('leads.list', {}, T.news);
    expect(list.body.total).toBe(1);
    expect(list.text).not.toContain('member.secret');
    expect((await call('leads.get', { id: member }, T.news)).status).toBe(404);
    expect((await call('leads.status', { id: member, from: 'new', to: 'closed' }, T.news)).status).toBe(404);
    expect((await call('leads.note', { id: member, body: 'hello' }, T.news)).status).toBe(404);
    expect(await dbStatus(member)).toBe('new');
    expect((await call('leads.get', { id: newsletter }, T.news)).status).toBe(200);
    expect((await call('leads.get', { id: '00000000-0000-4000-8000-0000000000aa' }, T.news)).status).toBe(404); // unknown looks the same
    expect((await call('leads.get', { id: 'not-a-uuid' }, T.news)).status).toBe(400);
  });

  it('shows the detail with consent version, time and source, and no extra fields', async () => {
    const id = await lead({ email: 'detail@lead.test', source_path: '/tin-tuc/test/', consent_text_version: 'join-v2' });
    const r = await call('leads.get', { id });
    expect(r.status).toBe(200);
    expect(r.body.lead).toMatchObject({ id, email: 'detail@lead.test', consent: true, consent_text_version: 'join-v2', source_path: '/tin-tuc/test/' });
    expect(r.body.lead.consent_at).toBeTruthy();
    expect(Object.keys(r.body.lead)).not.toContain('ip_hash');
    expect((await audit('lead_view')).at(-1)).toMatchObject({ lead_id: id, actor_email: STAFF.email });
  });

  it('moves a lead New -> In progress -> Closed, refuses a stale form (409) and unknown values (400), and audits each change', async () => {
    const id = await lead();
    expect((await call('leads.status', { id, from: 'new', to: 'contacted' })).body).toEqual({ ok: true, result: 'ok' });
    expect(await dbStatus(id)).toBe('contacted');
    const stale = await call('leads.status', { id, from: 'new', to: 'closed' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('conflict');
    expect(await dbStatus(id)).toBe('contacted');
    expect((await call('leads.status', { id, from: 'contacted', to: 'closed' })).status).toBe(200);
    expect((await call('leads.status', { id, from: 'closed', to: 'closed' })).body.result).toBe('noop');
    expect((await call('leads.status', { id, from: 'closed', to: 'qualified' })).status).toBe(400); // not a person-settable status
    expect((await call('leads.status', { id, from: 'bogus', to: 'closed' })).status).toBe(400);
    expect((await call('leads.status', { id: 'nope', from: 'new', to: 'closed' })).status).toBe(400);
    expect((await audit('lead_status')).filter((r) => r.lead_id === id)).toHaveLength(2);
  });

  it('refuses to change a lead that was unsubscribed or erased (423-style lock reported as 409 locked)', async () => {
    const id = await lead({ kind: 'newsletter', status: 'unsubscribed' });
    const r = await call('leads.status', { id, from: 'unsubscribed', to: 'closed' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('locked');
  });

  it('stores internal notes with the author and time taken from the database, and lists them in the detail', async () => {
    const id = await lead();
    expect((await call('leads.note', { id, body: '  Gọi lại thứ Hai\nvề hội viên  ' })).body).toEqual({ ok: true });
    const detail = await call('leads.get', { id });
    expect(detail.body.notes).toHaveLength(1);
    expect(detail.body.notes[0]).toMatchObject({ author_email: STAFF.email, body: 'Gọi lại thứ Hai\nvề hội viên' });
    expect(detail.body.notes[0].created_at).toBeTruthy();
    expect((await call('leads.note', { id, body: 'x', author_email: 'forged@x.test' })).status).toBe(200); // a forged author field is ignored
    expect((await db.query<{ author_email: string }>('select author_email from public.lead_notes where lead_id = $1 order by created_at', [id])).rows.map((r) => r.author_email)).toEqual([STAFF.email, STAFF.email]);
    expect((await call('leads.note', { id, body: '   ' })).body.code).toBe('note_invalid');
    expect((await call('leads.note', { id, body: 'a'.repeat(2001) })).body.code).toBe('note_invalid');
    expect((await call('leads.note', { id, body: 'a'.repeat(2000) })).status).toBe(200);
    expect((await call('leads.note', { id, body: 'nul\u0000byte' })).status).toBe(200); // PostgreSQL text cannot hold NUL: dropped, not a 500
    expect((await call('leads.note', { id, body: 5 })).body.code).toBe('note_invalid');
  });

  it('shows the same lead data to an administrator, who is scoped like everybody else', async () => {
    const id = await lead({ email: 'admin.sees@lead.test' });
    expect((await call('leads.get', { id }, T.admin)).body.lead.email).toBe('admin.sees@lead.test');
  });
});

describe('staff management (administrators only)', () => {
  beforeEach(async () => {
    await open(T.admin);
    await open(T.staff);
  });

  it('refuses staff.* for a plain staff member, at the handler and in the database', async () => {
    for (const [op, params] of [['staff.list', {}], ['staff.upsert', { email: 'new@x.vn', role: 'admin', kinds: ['membership'] }], ['staff.setActive', { email: ADMIN.email, active: false }]] as const) {
      const r = await call(op, params, T.staff);
      expect(r.status, op).toBe(403);
      expect(r.body.code, op).toBe('forbidden');
    }
    expect((await db.query('select 1 from public.crm_staff where email = $1', ['new@x.vn'])).rows).toHaveLength(0);
  });

  it('lets an administrator list, invite, change scope and deactivate, with validation', async () => {
    const listed = await call('staff.list', {}, T.admin);
    expect(listed.status).toBe(200);
    expect(listed.body.staff.map((s: { email: string }) => s.email)).toEqual(expect.arrayContaining([ADMIN.email, STAFF.email, NEWS.email]));
    expect((await call('staff.upsert', { email: ' New.Person@VBFA.test ', role: 'staff', kinds: ['newsletter', 'bogus'] }, T.admin)).body).toEqual({ ok: true, result: 'created' });
    expect((await db.query<{ kinds: string[]; created_by: string }>("select kinds, created_by from public.crm_staff where email = 'new.person@vbfa.test'")).rows[0]).toEqual({ kinds: ['newsletter'], created_by: ADMIN.email });
    expect((await call('staff.upsert', { email: 'new.person@vbfa.test', role: 'staff', kinds: ['membership', 'newsletter'] }, T.admin)).body.result).toBe('updated');
    for (const bad of [{ email: 'no-at', role: 'staff', kinds: ['membership'] }, { email: 'a@b.vn', role: 'owner', kinds: ['membership'] }, { email: 'a@b.vn', role: 'staff', kinds: [] }, { email: 'a@b.vn', role: 'staff', kinds: ['bogus'] }, { email: 'a@b.vn', role: 'staff' }]) {
      expect((await call('staff.upsert', bad, T.admin)).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await call('staff.setActive', { email: 'new.person@vbfa.test', active: false }, T.admin)).body.result).toBe('ok');
    expect((await call('staff.setActive', { email: 'ghost@vbfa.test', active: false }, T.admin)).status).toBe(404);
    expect((await call('staff.setActive', { email: 'new.person@vbfa.test', active: 'no' }, T.admin)).status).toBe(400);
    expect((await audit('staff_upsert')).length).toBeGreaterThanOrEqual(2);
  });

  it('never removes the last bound administrator, by deactivation or by demotion (409)', async () => {
    const own = await call('staff.setActive', { email: ADMIN.email, active: false }, T.admin);
    expect(own.status).toBe(409);
    expect(own.body.code).toBe('last_admin');
    const demote = await call('staff.upsert', { email: ADMIN.email, role: 'staff', kinds: ['membership'] }, T.admin);
    expect(demote.status).toBe(409);
    expect((await call('staff.list', {}, T.admin)).status).toBe(200);
  });
});

describe('logs', () => {
  it('carry operation, status, role and duration only: no e-mail, token, lead data or note text', async () => {
    const id = await lead({ email: 'log.subject@lead.test', name: 'Log Subject' });
    await open(T.staff);
    await call('leads.list', { q: 'log.subject' });
    await call('leads.get', { id });
    await call('leads.note', { id, body: 'private note text' });
    await call('session', {}, 'unknown-token-0123456789');
    await call('session', {}, T.outsider);
    const text = logs.lines.join('\n');
    expect(text).toContain('portal.request');
    for (const secret of [T.staff, T.outsider, 'unknown-token-0123456789', '@', 'log.subject', 'Log Subject', 'private note text', 'Bearer']) expect(text, secret).not.toContain(secret);
    const first = JSON.parse(logs.lines[0]!);
    expect(Object.keys(first).sort()).toEqual(['durationMs', 'event', 'level', 'op', 'requestId', 'role', 'status', 'ts']);
  });

  it('reports an unexpected database failure as 500 without internals', async () => {
    const broken = pgliteStore(db);
    broken.listLeads = () => Promise.reject(new Error('connection to server at "10.0.0.5" failed: password authentication failed for user "postgres"'));
    const request = new Request(`${ORIGIN}/api/portal`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${T.staff}` }, body: JSON.stringify({ op: 'leads.list' }) });
    await open(T.staff);
    const response = await handlePortal(request, { store: broken, identity: verifier, log: logs.log });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, code: 'error' });
    expect(logs.lines.join('\n')).not.toContain('10.0.0.5');
  });
});
