import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Runs the real migration in an in-process Postgres (PGlite) with Supabase-like roles, so the schema,
 * constraints, row level security and the retention function are verified without touching a live project.
 */
let db: PGlite;
const sql = await readFile(new URL('./migrations/0001_website_leads.sql', import.meta.url), 'utf8');

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
  await db.exec(sql);
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
