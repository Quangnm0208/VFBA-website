import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * CRM Lead Inbox (migration 0007) in an in-process Postgres with Supabase-like roles: access model, staff scope, status
 * workflow, notes, audit trail and sign-in throttle. The browser roles must be unable to touch any CRM object.
 */
let db: PGlite;

const files = (await readdir(new URL('./migrations/', import.meta.url))).filter((f) => f.endsWith('.sql')).sort();
const sources = await Promise.all(files.map(async (f) => [f, await readFile(new URL(`./migrations/${f}`, import.meta.url), 'utf8')] as const));
const migrations = sources.filter(([, sql]) => !/create extension if not exists pg_cron/i.test(sql)).map(([, sql]) => sql);

const ADMIN = '00000000-0000-4000-8000-0000000000a1';
const STAFF = '00000000-0000-4000-8000-0000000000b2';
const NEWS_ONLY = '00000000-0000-4000-8000-0000000000c3';
const INACTIVE = '00000000-0000-4000-8000-0000000000d4';
const STRANGER = '00000000-0000-4000-8000-0000000000e5';

const code = async (p: Promise<unknown>) => ((await p.then(() => ({ code: 'OK' }), (e) => e)) as { code: string }).code;
const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await rows<T>(sql, params))[0]!;

async function lead(over: Record<string, unknown> = {}): Promise<string> {
  const row = { kind: 'membership', name: 'Nguyễn Văn A', company: 'ABC', email: `a${Math.random().toString(36).slice(2)}@abc.vn`, consent: true, consent_text_version: 'join-v2', ...over };
  const keys = Object.keys(row);
  return (await one<{ id: string }>(`insert into public.website_leads (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(row))).id;
}
const list = (actor: string, f: { kind?: string; status?: string; from?: string; to?: string; q?: string; limit?: number; offset?: number } = {}) =>
  rows<{ id: string; kind: string; name: string | null; email: string; status: string; notes: string; total: string }>(
    'select * from public.crm_list_leads($1, $2, $3, $4, $5, $6, $7, $8)',
    [actor, f.kind ?? null, f.status ?? null, f.from ?? null, f.to ?? null, f.q ?? null, f.limit ?? 25, f.offset ?? 0],
  );
const status = async (actor: string, id: string, from: string, to: string) => (await one<{ r: string }>('select public.crm_set_status($1, $2, $3, $4) as r', [actor, id, from, to])).r;
const note = async (actor: string, id: string, body: string) => (await one<{ r: string }>('select public.crm_add_note($1, $2, $3) as r', [actor, id, body])).r;
const audit = (action?: string) => rows<{ action: string; actor_email: string | null; lead_id: string | null; detail: Record<string, unknown> }>(
  `select action, actor_email, lead_id, detail from public.crm_audit_log ${action ? 'where action = $1' : ''} order by id`, action ? [action] : [],
);

const FUNCTIONS = [
  'crm_login_throttle(text, text, interval, integer, integer)',
  'crm_login(uuid, text)',
  'crm_whoami(uuid)',
  'crm_record_event(uuid, text, text)',
  'crm_list_leads(uuid, text, text, date, date, text, integer, integer)',
  'crm_get_lead(uuid, uuid)',
  'crm_set_status(uuid, uuid, text, text)',
  'crm_add_note(uuid, uuid, text)',
  'crm_staff_list(uuid)',
  'crm_staff_upsert(uuid, text, text, text[], boolean)',
  'crm_staff_set_active(uuid, text, boolean)',
];
const TABLES = ['crm_staff', 'lead_notes', 'crm_audit_log', 'crm_login_attempts'];

beforeAll(async () => {
  db = new PGlite();
  // Same fixture as migrations.test.ts, plus Supabase's default privileges (new tables and functions are granted to the API roles).
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create function public.rls_auto_enable() returns void language plpgsql security definer set search_path = pg_catalog as $$ begin end $$;
    grant execute on function public.rls_auto_enable() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const sql of migrations) await db.exec(sql);
  await db.exec('grant usage on schema public to anon, authenticated, service_role');
  // Staff fixture. user_id is bound by the sign-in function, like in production.
  await db.exec(`insert into public.crm_staff (email, role, created_by) values ('admin@vbfa.test', 'admin', 'test'), ('staff@vbfa.test', 'staff', 'test');
    insert into public.crm_staff (email, role, kinds, created_by) values ('news@vbfa.test', 'staff', array['newsletter'], 'test');
    insert into public.crm_staff (email, role, active, created_by) values ('gone@vbfa.test', 'staff', false, 'test');`);
  for (const [email, id] of [['admin@vbfa.test', ADMIN], ['staff@vbfa.test', STAFF], ['news@vbfa.test', NEWS_ONLY]] as const) {
    await db.query('select * from public.crm_login($1, $2)', [id, email]);
  }
  await db.exec(`update public.crm_staff set user_id = '${INACTIVE}' where email = 'gone@vbfa.test'`);
});

describe('access model (0007)', () => {
  it('the new tables have row level security, no policies, and no privileges for the browser roles', async () => {
    for (const t of TABLES) {
      expect((await one<{ rls: boolean }>('select relrowsecurity as rls from pg_class where oid = $1::regclass', [`public.${t}`])).rls).toBe(true);
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        expect(await code(db.query(`select * from public.${t}`))).toBe('42501');
        expect(await code(db.query(`delete from public.${t}`))).toBe('42501');
        await db.exec('reset role');
      }
    }
    expect((await one<{ n: number }>("select count(*)::int as n from pg_policies where schemaname = 'public'")).n).toBe(0);
  });

  it('every CRM function is executable by service_role only: PUBLIC, anon and authenticated are refused', async () => {
    for (const fn of FUNCTIONS) {
      const acl = (await one<{ acl: string | null }>('select proacl::text as acl from pg_proc where oid = $1::regprocedure', [`public.${fn}`])).acl ?? '';
      expect(acl, fn).toContain('service_role=X');
      expect(acl, fn).not.toMatch(/(^\{|,)=X/); // no PUBLIC grant
      expect(acl, fn).not.toContain('anon=');
      expect(acl, fn).not.toContain('authenticated=');
    }
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      expect(await code(db.query('select * from public.crm_whoami($1)', [ADMIN]))).toBe('42501');
      expect(await code(db.query('select * from public.crm_list_leads($1)', [ADMIN]))).toBe('42501');
      expect(await code(db.query("select public.crm_set_status($1, $1, 'new', 'closed')", [ADMIN]))).toBe('42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    expect((await rows('select * from public.crm_whoami($1)', [ADMIN])).length).toBe(1);
    await db.exec('reset role');
  });

  it('is definer-with-empty-search_path for every CRM function (no object hijacking)', async () => {
    for (const fn of FUNCTIONS) {
      const r = await one<{ secdef: boolean; cfg: string[] | null }>('select prosecdef as secdef, proconfig as cfg from pg_proc where oid = $1::regprocedure', [`public.${fn}`]);
      expect(r.secdef, fn).toBe(true);
      expect(r.cfg, fn).toEqual(['search_path=""']);
    }
  });

  it('adds nothing to website_leads: columns, grants and policies are those of 0001-0006', async () => {
    const cols = (await rows<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'website_leads' order by ordinal_position")).map((r) => r.column_name);
    expect(cols).toEqual(['id', 'kind', 'name', 'company', 'email', 'phone', 'interest', 'message', 'consent', 'consent_text_version', 'consent_at', 'source_path', 'utm', 'ip_hash', 'status', 'created_at', 'updated_at']);
    await db.exec('set role authenticated');
    expect(await code(db.query('select * from public.website_leads'))).toBe('42501');
    await db.exec('reset role');
  });
});

describe('sign-in binding (crm_login / crm_whoami)', () => {
  it('lets only allowlisted, active people in, case-insensitively, and binds the Auth user on first use', async () => {
    expect(await rows('select * from public.crm_login($1, $2)', [STRANGER, 'nobody@vbfa.test'])).toEqual([]);
    expect(await rows('select * from public.crm_login($1, $2)', [INACTIVE, 'gone@vbfa.test'])).toEqual([]);
    expect(await rows('select * from public.crm_login($1, $2)', [ADMIN, '  ADMIN@VBFA.test '])).toMatchObject([{ email: 'admin@vbfa.test', role: 'admin' }]);
  });

  it('refuses another Auth user presenting an allowlisted e-mail (binding mismatch) and records it', async () => {
    expect(await rows('select * from public.crm_login($1, $2)', [STRANGER, 'staff@vbfa.test'])).toEqual([]);
    const denied = await audit('login_denied');
    expect(denied.at(-1)).toMatchObject({ actor_email: 'staff@vbfa.test', detail: { reason: 'binding_mismatch' } });
    expect(await rows('select * from public.crm_whoami($1)', [STRANGER])).toEqual([]);
  });

  it('whoami answers for active bound users only', async () => {
    expect(await rows('select * from public.crm_whoami($1)', [STAFF])).toMatchObject([{ email: 'staff@vbfa.test', role: 'staff', kinds: ['membership', 'newsletter', 'contact'] }]);
    expect(await rows('select * from public.crm_whoami($1)', [NEWS_ONLY])).toMatchObject([{ kinds: ['newsletter'] }]);
    expect(await rows('select * from public.crm_whoami($1)', [INACTIVE])).toEqual([]);
  });

  it('rejects malformed allowlist rows (upper-case e-mail, empty scope, unknown role or kind)', async () => {
    expect(await code(db.query("insert into public.crm_staff (email, role) values ('Up@vbfa.test', 'staff')"))).toBe('23514');
    expect(await code(db.query("insert into public.crm_staff (email, role, kinds) values ('x@vbfa.test', 'staff', '{}')"))).toBe('23514');
    expect(await code(db.query("insert into public.crm_staff (email, role, kinds) values ('x@vbfa.test', 'staff', array['spam'])"))).toBe('23514');
    expect(await code(db.query("insert into public.crm_staff (email, role) values ('x@vbfa.test', 'owner')"))).toBe('23514');
  });
});

describe('Lead Inbox list', () => {
  const ids: Record<string, string> = {};
  beforeAll(async () => {
    ids.m1 = await lead({ name: 'Trần Thị Bình', company: 'Công ty Bình An', email: 'binh@an.vn' });
    ids.m2 = await lead({ name: '100% Organic_Co', company: 'Organic', email: 'organic@co.vn', created_at: '2026-01-15T03:00:00Z' });
    ids.n1 = await lead({ kind: 'newsletter', name: null, company: null, email: 'reader1@news.vn' });
    ids.n2 = await lead({ kind: 'newsletter', name: null, company: null, email: 'reader2@news.vn', status: 'contacted' });
    ids.gone = await lead({ name: 'Pending erasure', email: 'erase@me.vn', status: 'deleted' });
    ids.unsub = await lead({ kind: 'newsletter', name: null, company: null, email: 'leaver@news.vn', status: 'unsubscribed' });
  });

  it('refuses people who are not active staff', async () => {
    for (const actor of [STRANGER, INACTIVE]) expect(await code(list(actor))).toBe('42501');
    expect(await code(list('00000000-0000-4000-8000-000000000000'))).toBe('42501');
  });

  it('shows the whole scope newest first, hides erased leads, and never exposes the address hash', async () => {
    const all = await list(STAFF);
    expect(all.map((r) => r.email)).not.toContain('erase@me.vn');
    expect(all.length).toBe(Number(all[0]!.total));
    const times = (await rows<{ created_at: string }>('select created_at from public.crm_list_leads($1)', [STAFF])).map((r) => new Date(r.created_at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(Object.keys(all[0]!)).not.toContain('ip_hash');
  });

  it('honours the agreed scope: a newsletter-only person never sees membership leads', async () => {
    const mine = await list(NEWS_ONLY);
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((r) => r.kind))).toEqual(new Set(['newsletter']));
    // asking for another kind does not widen the scope
    expect(await list(NEWS_ONLY, { kind: 'membership' })).toEqual([]);
  });

  it('filters by kind, status and creation date (Vietnam calendar days)', async () => {
    expect((await list(STAFF, { kind: 'newsletter' })).every((r) => r.kind === 'newsletter')).toBe(true);
    expect((await list(STAFF, { status: 'contacted' })).map((r) => r.email)).toEqual(['reader2@news.vn']);
    expect(await code(list(STAFF, { status: 'deleted' }))).toBe('22023'); // pending erasure cannot be requested, not even by an in-scope person
    // 2026-01-15 03:00 UTC = 10:00 on the 15th in Vietnam
    expect((await list(STAFF, { from: '2026-01-15', to: '2026-01-15' })).map((r) => r.email)).toEqual(['organic@co.vn']);
    expect(await list(STAFF, { from: '2026-01-16', to: '2026-01-31' })).toEqual([]);
  });

  it('searches name, company and e-mail case-insensitively, and treats % and _ as literal characters', async () => {
    expect((await list(STAFF, { q: 'BÌNH' })).map((r) => r.email)).toEqual(['binh@an.vn']);
    expect((await list(STAFF, { q: 'reader1' })).map((r) => r.email)).toEqual(['reader1@news.vn']);
    expect((await list(STAFF, { q: 'công ty bình' })).map((r) => r.email)).toEqual(['binh@an.vn']);
    expect((await list(STAFF, { q: '100%' })).map((r) => r.email)).toEqual(['organic@co.vn']);
    expect((await list(STAFF, { q: '%' })).map((r) => r.email)).toEqual(['organic@co.vn']);
    expect((await list(STAFF, { q: '_' })).map((r) => r.email)).toEqual(['organic@co.vn']);
    expect(await list(STAFF, { q: "x' or '1'='1" })).toEqual([]);
  });

  it('paginates with a stable total and clamps silly limits', async () => {
    const total = Number((await list(STAFF))[0]!.total);
    const a = await list(STAFF, { limit: 2, offset: 0 });
    const b = await list(STAFF, { limit: 2, offset: 2 });
    expect(a.length).toBe(2);
    expect(Number(a[0]!.total)).toBe(total);
    expect(new Set([...a, ...b].map((r) => r.id)).size).toBe(Math.min(4, total));
    expect((await list(STAFF, { limit: 100000 })).length).toBe(total);
    expect((await list(STAFF, { limit: -5, offset: -9 })).length).toBe(1);
    expect(await list(STAFF, { offset: 1000 })).toEqual([]);
  });

  it('rejects unknown filter values instead of ignoring them', async () => {
    expect(await code(list(STAFF, { kind: 'spam' }))).toBe('22023');
    expect(await code(list(STAFF, { status: 'spam' }))).toBe('22023');
  });
});

describe('lead detail, status workflow and notes', () => {
  it('returns the lead with consent source and time, but never ip_hash; unknown, erased and out-of-scope ids look identical (null)', async () => {
    const id = await lead({ name: 'Lê Văn C', email: 'c@c.vn', ip_hash: 'a'.repeat(32), source_path: '/tin-tuc/', utm: { utm_source: 'fb' } });
    const out = (await one<{ r: { lead: Record<string, unknown>; notes: unknown[] } | null }>('select public.crm_get_lead($1, $2) as r', [STAFF, id])).r!;
    expect(out.lead).toMatchObject({ id, kind: 'membership', name: 'Lê Văn C', consent: true, consent_text_version: 'join-v2', source_path: '/tin-tuc/', utm: { utm_source: 'fb' }, status: 'new' });
    expect(out.lead.consent_at).toBeTruthy();
    expect(Object.keys(out.lead)).not.toContain('ip_hash');
    expect(out.notes).toEqual([]);

    const erased = await lead({ status: 'deleted', email: 'z@z.vn' });
    const missing = '11111111-1111-4111-8111-111111111111';
    for (const target of [missing, erased]) expect((await one<{ r: unknown }>('select public.crm_get_lead($1, $2) as r', [STAFF, target])).r).toBeNull();
    expect((await one<{ r: unknown }>('select public.crm_get_lead($1, $2) as r', [NEWS_ONLY, id])).r).toBeNull(); // membership lead, newsletter-only actor
    expect(await code(db.query('select public.crm_get_lead($1, $2)', [STRANGER, id]))).toBe('42501');
    expect((await audit('lead_view')).some((a) => a.lead_id === id && a.actor_email === 'staff@vbfa.test')).toBe(true);
  });

  it('moves a lead New -> In progress -> Closed with optimistic concurrency, records who did it, and keeps updated_at current', async () => {
    const id = await lead({ email: 'flow@c.vn' });
    const before = (await one<{ u: string }>('select updated_at as u from public.website_leads where id = $1', [id])).u;
    await new Promise((r) => setTimeout(r, 15));
    expect(await status(STAFF, id, 'new', 'contacted')).toBe('ok');
    expect(await status(STAFF, id, 'new', 'closed')).toBe('conflict'); // stale form: somebody already moved it
    expect(await status(STAFF, id, 'contacted', 'contacted')).toBe('noop');
    expect(await status(ADMIN, id, 'contacted', 'closed')).toBe('ok');
    expect(await status(STAFF, id, 'closed', 'new')).toBe('ok'); // re-open
    expect((await one<{ status: string; u: string }>('select status, updated_at as u from public.website_leads where id = $1', [id])).status).toBe('new');
    expect(new Date((await one<{ u: string }>('select updated_at as u from public.website_leads where id = $1', [id])).u).getTime()).toBeGreaterThan(new Date(before).getTime());
    const trail = (await audit('lead_status')).filter((a) => a.lead_id === id);
    expect(trail.map((a) => a.detail)).toEqual([{ from: 'new', to: 'contacted' }, { from: 'contacted', to: 'closed' }, { from: 'closed', to: 'new' }]);
    expect(trail.map((a) => a.actor_email)).toEqual(['staff@vbfa.test', 'admin@vbfa.test', 'staff@vbfa.test']);
  });

  it('only allows the three workflow statuses as a target and never touches unsubscribed or erased leads', async () => {
    const id = await lead({ email: 'edge@c.vn' });
    for (const bad of ['deleted', 'unsubscribed', 'qualified', 'spam', '']) expect(await code(status(STAFF, id, 'new', bad))).toBe('22023');
    const unsub = await lead({ kind: 'newsletter', name: null, company: null, email: 'u@c.vn', status: 'unsubscribed' });
    expect(await status(STAFF, unsub, 'unsubscribed', 'contacted')).toBe('locked');
    const erased = await lead({ email: 'e@c.vn', status: 'deleted' });
    expect(await status(STAFF, erased, 'deleted', 'new')).toBe('not_found');
    expect(await status(STAFF, '22222222-2222-4222-8222-222222222222', 'new', 'closed')).toBe('not_found');
  });

  it('cannot change a lead outside the actor scope or act without being staff (IDOR)', async () => {
    const id = await lead({ email: 'idor@c.vn' }); // membership
    expect(await status(NEWS_ONLY, id, 'new', 'closed')).toBe('not_found');
    expect(await note(NEWS_ONLY, id, 'sneaky')).toBe('not_found');
    expect((await one<{ status: string }>('select status from public.website_leads where id = $1', [id])).status).toBe('new');
    expect(await code(db.query("select public.crm_set_status($1, $2, 'new', 'closed')", [STRANGER, id]))).toBe('42501');
    expect(await code(db.query("select public.crm_set_status($1, $2, 'new', 'closed')", [INACTIVE, id]))).toBe('42501');
    expect(await code(db.query("select public.crm_add_note($1, $2, 'x')", [INACTIVE, id]))).toBe('42501');
  });

  it('stores notes with author and time taken from the database, in order, and shows them in the detail', async () => {
    const id = await lead({ email: 'notes@c.vn' });
    expect(await note(STAFF, id, '  Đã gọi, hẹn gặp thứ Sáu.  ')).toBe('ok');
    expect(await note(ADMIN, id, 'Đã gửi hồ sơ.')).toBe('ok');
    const out = (await one<{ r: { notes: Array<{ author_email: string; body: string; created_at: string }> } }>('select public.crm_get_lead($1, $2) as r', [STAFF, id])).r;
    expect(out.notes.map((n) => [n.author_email, n.body])).toEqual([['staff@vbfa.test', 'Đã gọi, hẹn gặp thứ Sáu.'], ['admin@vbfa.test', 'Đã gửi hồ sơ.']]);
    expect(out.notes.every((n) => n.created_at)).toBe(true);
    expect(Number((await list(STAFF, { q: 'notes@c.vn' }))[0]!.notes)).toBe(2);
  });

  it('validates notes (1-2000 characters after trimming) and never copies note text into the audit trail', async () => {
    const id = await lead({ email: 'valid@c.vn' });
    for (const bad of ['', '   ', 'x'.repeat(2001)]) expect(await code(note(STAFF, id, bad))).toBe('22023');
    expect(await note(STAFF, id, 'x'.repeat(2000))).toBe('ok');
    expect(await note(STAFF, id, 'SECRET-NOTE-TEXT')).toBe('ok');
    const noteAudit = (await audit('lead_note')).filter((a) => a.lead_id === id);
    expect(noteAudit.length).toBe(2);
    expect(JSON.stringify(noteAudit)).not.toContain('SECRET-NOTE-TEXT');
  });

  it('deletes notes with the lead (erasure request) while the audit trail survives without personal data', async () => {
    const id = await lead({ name: 'Người Bị Xoá', email: 'erase-cascade@c.vn' });
    await note(STAFF, id, 'ghi chú riêng');
    await status(STAFF, id, 'new', 'closed');
    await db.query('delete from public.website_leads where id = $1', [id]);
    expect((await one<{ n: number }>('select count(*)::int as n from public.lead_notes where lead_id = $1', [id])).n).toBe(0);
    const trail = (await rows<{ action: string; detail: unknown }>('select action, detail from public.crm_audit_log where lead_id = $1', [id]));
    expect(trail.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(trail)).not.toMatch(/Người Bị Xoá|erase-cascade|ghi chú riêng/);
  });

  it('keeps lead personal data out of the whole audit trail', async () => {
    const dump = JSON.stringify(await audit());
    for (const pii of ['Trần Thị Bình', 'binh@an.vn', 'reader1@news.vn', 'Lê Văn C', 'c@c.vn', 'Đã gọi']) expect(dump).not.toContain(pii);
  });
});

describe('staff management (admin only)', () => {
  const list = (actor: string) => rows<{ email: string; role: string; kinds: string[]; active: boolean; bound: boolean }>('select * from public.crm_staff_list($1)', [actor]);
  const upsert = async (actor: string, email: string, role: string, kinds: string[], reset = false) =>
    (await one<{ r: string }>('select public.crm_staff_upsert($1, $2, $3, $4::text[], $5) as r', [actor, email, role, kinds, reset])).r;
  const setActive = async (actor: string, email: string, active: boolean) => (await one<{ r: string }>('select public.crm_staff_set_active($1, $2, $3) as r', [actor, email, active])).r;

  it('is closed to staff, inactive and unknown users', async () => {
    for (const actor of [STAFF, NEWS_ONLY, INACTIVE, STRANGER]) {
      expect(await code(list(actor))).toBe('42501');
      expect(await code(upsert(actor, 'x@vbfa.test', 'admin', ['membership']))).toBe('42501');
      expect(await code(setActive(actor, 'admin@vbfa.test', false))).toBe('42501');
    }
  });

  it('lets an admin list, add and change people; the Auth user is bound later by sign-in', async () => {
    expect(await upsert(ADMIN, ' New.Person@VBFA.test ', 'staff', ['membership'])).toBe('created');
    expect(await upsert(ADMIN, 'new.person@vbfa.test', 'staff', ['membership', 'newsletter'])).toBe('updated');
    const person = (await list(ADMIN)).find((s) => s.email === 'new.person@vbfa.test')!;
    expect(person).toMatchObject({ role: 'staff', kinds: ['membership', 'newsletter'], active: true, bound: false });
    expect((await audit('staff_upsert')).at(-1)).toMatchObject({ actor_email: 'admin@vbfa.test', detail: { target: 'new.person@vbfa.test', role: 'staff', created: false } });
  });

  it('validates e-mail, role and scope', async () => {
    expect(await code(upsert(ADMIN, 'not-an-email', 'staff', ['membership']))).toBe('22023');
    expect(await code(upsert(ADMIN, 'ok@vbfa.test', 'owner', ['membership']))).toBe('22023');
    expect(await code(upsert(ADMIN, 'ok@vbfa.test', 'staff', []))).toBe('22023');
    expect(await code(upsert(ADMIN, 'ok@vbfa.test', 'staff', ['spam']))).toBe('22023');
  });

  it('never leaves the CRM without an administrator who can sign in', async () => {
    expect(await upsert(ADMIN, 'admin@vbfa.test', 'staff', ['membership'])).toBe('last_admin');
    expect(await setActive(ADMIN, 'admin@vbfa.test', false)).toBe('last_admin');
    expect(await upsert(ADMIN, 'second.admin@vbfa.test', 'admin', ['membership', 'newsletter', 'contact'])).toBe('created');
    // the second administrator has never signed in (no Auth user bound yet): they cannot be relied on, so the first one stays
    expect(await upsert(ADMIN, 'admin@vbfa.test', 'staff', ['membership'])).toBe('last_admin');
    expect(await setActive(ADMIN, 'admin@vbfa.test', false)).toBe('last_admin');
    expect(await setActive(ADMIN, 'second.admin@vbfa.test', false)).toBe('ok'); // the other (bound) administrator remains
    expect(await setActive(ADMIN, 'second.admin@vbfa.test', true)).toBe('ok');
    expect(await setActive(ADMIN, 'ghost@vbfa.test', false)).toBe('not_found');
  });

  it('serialises the two staff mutators with an advisory lock (the last-admin rule cannot be raced)', async () => {
    for (const fn of ['crm_staff_upsert', 'crm_staff_set_active']) {
      const def = (await one<{ d: string }>("select pg_get_functiondef(p.oid) as d from pg_proc p where p.proname = $1 and p.pronamespace = 'public'::regnamespace", [fn])).d;
      expect(def, fn).toContain("pg_advisory_xact_lock(hashtext('vbfa.crm_staff'))");
    }
  });

  it('a deactivated person is locked out immediately, and can be re-enabled', async () => {
    expect(await setActive(ADMIN, 'staff@vbfa.test', false)).toBe('ok');
    expect(await code(rows('select * from public.crm_list_leads($1)', [STAFF]))).toBe('42501');
    expect(await rows('select * from public.crm_whoami($1)', [STAFF])).toEqual([]);
    expect(await setActive(ADMIN, 'staff@vbfa.test', true)).toBe('ok');
    expect((await rows('select * from public.crm_list_leads($1)', [STAFF])).length).toBeGreaterThan(0);
  });

  it('can forget a binding (Auth user deleted and re-created) so the new Auth user can sign in', async () => {
    const fresh = '00000000-0000-4000-8000-0000000000f6';
    expect(await rows('select * from public.crm_login($1, $2)', [fresh, 'news@vbfa.test'])).toEqual([]);
    expect(await upsert(ADMIN, 'news@vbfa.test', 'staff', ['newsletter'], true)).toBe('updated');
    expect(await rows('select * from public.crm_login($1, $2)', [fresh, 'news@vbfa.test'])).toMatchObject([{ email: 'news@vbfa.test' }]);
    expect(await rows('select * from public.crm_whoami($1)', [NEWS_ONLY])).toEqual([]); // the old Auth user is out
  });
});

describe('sign-in throttle and events', () => {
  const attempt = async (ip: string, subject: string, ...limits: [string, number, number] | []) =>
    (await one<{ r: string }>(limits.length ? 'select public.crm_login_throttle($1, $2, $3::interval, $4, $5) as r' : 'select public.crm_login_throttle($1, $2) as r', [ip, subject, ...limits])).r;

  it('refuses the 21st attempt from one address and the 9th for one e-mail within the window', async () => {
    for (let i = 0; i < 20; i++) expect(await attempt('ip-flood', `subject-${i}`)).toBe('ok');
    expect(await attempt('ip-flood', 'subject-x')).toBe('ip');
    for (let i = 0; i < 8; i++) expect(await attempt(`ip-${i}`, 'subject-target')).toBe('ok');
    expect(await attempt('ip-fresh', 'subject-target')).toBe('account');
    expect(await attempt('ip-fresh', 'subject-other')).toBe('ok');
  });

  it('does not store refused attempts (a flood cannot extend a lock or grow the table)', async () => {
    for (let i = 0; i < 25; i++) await attempt('ip-store', `subject-store-${i}`);
    expect((await one<{ n: number }>("select count(*)::int as n from public.crm_login_attempts where ip_hash = 'ip-store'")).n).toBe(20);
    for (let i = 0; i < 12; i++) await attempt(`ip-s-${i}`, 'subject-store-target');
    expect((await one<{ n: number }>("select count(*)::int as n from public.crm_login_attempts where subject_hash = 'subject-store-target'")).n).toBe(8);
  });

  it('serves the clean-up of old rows with an index on created_at', async () => {
    const { rows: idx } = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'crm_login_attempts_created_idx'");
    expect(idx[0]?.indexdef).toContain('(created_at)');
  });

  it('ignores attempts older than the window and deletes rows older than a day', async () => {
    await db.query("insert into public.crm_login_attempts (ip_hash, subject_hash, created_at) select 'ip-old', 'subject-old', now() - interval '11 minutes' from generate_series(1, 50)");
    expect(await attempt('ip-old', 'subject-old')).toBe('ok');
    await db.query("insert into public.crm_login_attempts (ip_hash, subject_hash, created_at) values ('ip-ancient', 'subject-ancient', now() - interval '2 days')");
    await attempt('ip-any', 'subject-any');
    expect((await one<{ n: number }>("select count(*)::int as n from public.crm_login_attempts where ip_hash = 'ip-ancient'")).n).toBe(0);
  });

  it('keeps only hashes in the throttle table', async () => {
    const cols = (await rows<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'crm_login_attempts' order by ordinal_position")).map((r) => r.column_name);
    expect(cols).toEqual(['id', 'ip_hash', 'subject_hash', 'created_at']);
  });

  it('records sign-outs and refused sign-ins, and rejects any other event name', async () => {
    await db.query("select public.crm_record_event($1, 'Staff@VBFA.test', 'logout')", [STAFF]);
    await db.query("select public.crm_record_event($1, 'intruder@elsewhere.test', 'denied')", [STRANGER]);
    expect((await audit('logout')).at(-1)).toMatchObject({ actor_email: 'staff@vbfa.test' });
    expect((await audit('denied')).at(-1)).toMatchObject({ actor_email: 'intruder@elsewhere.test' });
    expect(await code(db.query("select public.crm_record_event($1, 'x@y.z', 'lead_status')", [STAFF]))).toBe('22023');
  });
});
