import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the real migration in an in-process Postgres (PGlite) with Supabase-like roles, so the schema,
 * constraints, row level security and the retention function are verified without touching a live project.
 */
let db: PGlite;
const migrations = await Promise.all(['0001_website_leads.sql', '0002_form_throttle.sql'].map((f) => readFile(new URL(`./migrations/${f}`, import.meta.url), 'utf8')));

const lead = (over: Record<string, unknown> = {}) => {
  const row = { kind: 'membership', name: 'Nguyễn Văn A', company: 'ABC', email: 'a@abc.vn', consent: true, consent_text_version: 'join-v2', ...over };
  const keys = Object.keys(row);
  return { text: `insert into public.website_leads (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`, params: Object.values(row) };
};
const insert = (over?: Record<string, unknown>) => db.query(lead(over).text, lead(over).params);
const code = async (p: Promise<unknown>) => ((await p.then(() => ({ code: 'OK' }), (e) => e)) as { code: string }).code;

beforeAll(async () => {
  db = new PGlite();
  // Supabase ships these roles; PGlite does not.
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
  for (const sql of migrations) await db.exec(sql);
  await db.exec(`grant usage on schema public to anon, authenticated, service_role; grant all on public.website_leads to service_role;`);
});

describe('website_leads migration', () => {
  it('stores a membership lead with defaults', async () => {
    await insert();
    const { rows } = await db.query<{ status: string; utm: unknown; source_path: string; consent_at: string }>('select status, utm, source_path, consent_at from public.website_leads');
    expect(rows[0]).toMatchObject({ status: 'new', utm: {}, source_path: '/' });
    expect(rows[0]!.consent_at).toBeTruthy();
  });

  it('rejects rows that were not consented, are malformed or have no name (membership)', async () => {
    expect(await code(insert({ consent: false }))).toBe('23514');
    expect(await code(insert({ email: 'not-an-email' }))).toBe('23514');
    expect(await code(insert({ kind: 'spam' }))).toBe('23514');
    expect(await code(insert({ name: '' }))).toBe('23514');
    expect(await code(insert({ message: 'x'.repeat(1001) }))).toBe('23514');
  });

  it('allows a newsletter row without a name, once per address (case-insensitive)', async () => {
    expect(await code(insert({ kind: 'newsletter', name: null, company: null, email: 'News@Abc.vn' }))).toBe('OK');
    expect(await code(insert({ kind: 'newsletter', name: null, company: null, email: 'news@abc.vn' }))).toBe('23505');
    // the same address may still submit the membership form
    expect(await code(insert({ kind: 'membership', email: 'news@abc.vn' }))).toBe('OK');
  });

  it('keeps updated_at current', async () => {
    const { rows } = await db.query<{ id: string }>(lead({ email: 'touch@abc.vn' }).text, lead({ email: 'touch@abc.vn' }).params);
    const before = (await db.query<{ updated_at: string }>('select updated_at from public.website_leads where id = $1', [rows[0]!.id])).rows[0]!.updated_at;
    await new Promise((r) => setTimeout(r, 15));
    await db.query("update public.website_leads set status = 'contacted' where id = $1", [rows[0]!.id]);
    const after = (await db.query<{ updated_at: string }>('select updated_at from public.website_leads where id = $1', [rows[0]!.id])).rows[0]!.updated_at;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('denies the browser roles everything; only the service role can read and write', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      expect(await code(db.query('select * from public.website_leads'))).toBe('42501');
      expect(await code(db.query("insert into public.website_leads (kind,email,consent,consent_text_version) values ('newsletter','x@y.vn',true,'v')"))).toBe('42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    expect((await db.query('select count(*)::int as n from public.website_leads')).rows[0]).toMatchObject({ n: expect.any(Number) });
    await db.exec('reset role');
  });

  it('purge_lead_metadata clears old address hashes only, and is not callable by the browser roles', async () => {
    await insert({ email: 'old@abc.vn', ip_hash: 'oldhash', created_at: new Date(Date.now() - 45 * 86_400_000).toISOString() });
    await insert({ email: 'new@abc.vn', ip_hash: 'newhash' });
    const purged = (await db.query<{ n: number }>("select public.purge_lead_metadata('30 days') as n")).rows[0]!.n;
    expect(purged).toBeGreaterThanOrEqual(1);
    const rows = (await db.query<{ email: string; ip_hash: string | null }>("select email, ip_hash from public.website_leads where email in ('old@abc.vn','new@abc.vn')")).rows;
    expect(rows.find((r) => r.email === 'old@abc.vn')!.ip_hash).toBeNull();
    expect(rows.find((r) => r.email === 'new@abc.vn')!.ip_hash).toBe('newhash');
    await db.exec('set role anon');
    expect(await code(db.query('select public.purge_lead_metadata()'))).toBe('42501');
    await db.exec('reset role');
  });

  it('rate-limit lookup uses the partial index shape (ip_hash, created_at)', async () => {
    const { rows } = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where indexname = 'website_leads_rate_idx'");
    expect(rows[0]!.indexdef).toContain('(ip_hash, created_at)');
  });
});

const attempt = async (hash: string, kind = 'newsletter', ...limits: [string, number, number] | []) =>
  (await db.query<{ r: string }>(limits.length ? 'select public.register_attempt($1, $2, $3::interval, $4, $5) as r' : 'select public.register_attempt($1, $2) as r', [hash, kind, ...limits])).rows[0]!.r;

describe('form_attempts / register_attempt (0002)', () => {
  it('counts every attempt, stored or not: the 16th within the window is refused', async () => {
    for (let i = 0; i < 15; i++) expect(await attempt('h-flood')).toBe('ok');
    expect(await attempt('h-flood')).toBe('attempts');
    expect(await attempt('h-flood', 'membership')).toBe('attempts'); // the counter is per address, not per form
    expect(await attempt('h-other')).toBe('ok'); // another address is unaffected
  });

  it('also refuses when stored leads already reached the cap', async () => {
    for (let i = 0; i < 5; i++) await insert({ email: `cap${i}@abc.vn`, ip_hash: 'h-leads' });
    expect(await attempt('h-leads')).toBe('leads');
    expect(await attempt('h-leads-clean')).toBe('ok');
  });

  it('only counts the window: older attempts and leads are ignored', async () => {
    await db.query("insert into public.form_attempts (ip_hash, kind, created_at) select 'h-old', 'newsletter', now() - interval '11 minutes' from generate_series(1, 40)");
    for (let i = 0; i < 6; i++) await insert({ email: `old${i}@abc.vn`, ip_hash: 'h-old', created_at: new Date(Date.now() - 11 * 60_000).toISOString() });
    expect(await attempt('h-old')).toBe('ok');
  });

  it('takes explicit limits and rejects unknown form kinds', async () => {
    expect(await attempt('h-custom', 'membership', '1 minute', 1, 1)).toBe('ok');
    expect(await attempt('h-custom', 'membership', '1 minute', 1, 1)).toBe('attempts');
    expect(await code(attempt('h-bad', 'spam'))).toBe('23514');
  });

  it('keeps no personal data: the table has only a hash, a kind and a time', async () => {
    const { rows } = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'form_attempts' order by ordinal_position");
    expect(rows.map((r) => r.column_name)).toEqual(['id', 'ip_hash', 'kind', 'created_at']);
  });

  it('is invisible and unusable for the browser roles; callable by the service role', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      expect(await code(db.query('select * from public.form_attempts'))).toBe('42501');
      expect(await code(db.query("insert into public.form_attempts (ip_hash, kind) values ('x', 'newsletter')"))).toBe('42501');
      expect(await code(db.query("select public.register_attempt('x', 'newsletter')"))).toBe('42501');
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    expect(await attempt('h-service')).toBe('ok');
    await db.exec('reset role');
  });

  it('purge_lead_metadata also empties attempts older than two days (and keeps recent ones)', async () => {
    await db.query("insert into public.form_attempts (ip_hash, kind, created_at) values ('h-purge', 'newsletter', now() - interval '3 days'), ('h-purge', 'newsletter', now() - interval '1 hour')");
    await db.query("select public.purge_lead_metadata()");
    const left = (await db.query<{ n: number }>("select count(*)::int as n from public.form_attempts where ip_hash = 'h-purge'")).rows[0]!.n;
    expect(left).toBe(1);
  });

  it('the pg_cron scheduling block is a no-op where the extension is absent', async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from pg_extension where extname = 'pg_cron'");
    expect(rows[0]!.n).toBe(0);
  });
});
