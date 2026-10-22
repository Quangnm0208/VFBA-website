#!/usr/bin/env node
/**
 * Builds a throw-away Postgres (PGlite) from supabase/migrations and prints the schema fingerprint
 * (supabase/fingerprint.sql). Compare it with the same query run on the live Supabase project: equal hashes mean the live
 * schema is exactly what the repository's migrations produce.
 *
 *   node scripts/qa/db-fingerprint.mjs
 *
 * Two things are emulated because PGlite is not a Supabase project: the roles anon / authenticated / service_role with
 * Supabase's default privileges, and the project-provided event-trigger helper public.rls_auto_enable() (migration 0003
 * restricts it). The migration that needs the pg_cron extension is skipped; the cron job is checked on the live project.
 */
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create function public.rls_auto_enable() returns void language plpgsql security definer set search_path = pg_catalog as $$ begin end $$;
  grant execute on function public.rls_auto_enable() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
for (const f of files) {
  const sql = await readFile(new URL(f, dir), 'utf8');
  if (/create extension if not exists pg_cron/i.test(sql)) { console.error(`skipped (needs pg_cron): ${f}`); continue; }
  await db.exec(sql);
}
const { rows } = await db.query(await readFile(new URL('../../supabase/fingerprint.sql', import.meta.url), 'utf8'));
console.log(JSON.stringify(rows[0]));
