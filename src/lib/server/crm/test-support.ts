/**
 * Test doubles for the CRM (used by vitest only; nothing in the application imports this file).
 *
 *  - `createTestDatabase()` builds a Postgres (PGlite) from the real migrations, so the handler tests run against the real SQL
 *    functions of migration 0007, not a re-implementation of them.
 *  - `pgliteStore()` is a CrmStore that calls those functions exactly like the Supabase store does.
 *  - `fakeAuth()` plays Supabase Auth: users, sessions, rotating refresh tokens, revocation on sign-out.
 *  - `browser()` is a tiny cookie-jar client that drives `handleCrm` like a person would.
 */
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { AuthClient, AuthUser, TokenResult } from './auth';
import { handleCrm, type CrmDeps } from './app';
import { createLogger } from '../log';
import { BadInputError, ForbiddenError, type CrmStore, type LeadRow, type StaffIdentity, type StatusResult } from './store';

export const ORIGIN = 'https://beta.vbfa.example';

export async function createTestDatabase(): Promise<PGlite> {
  const dir = new URL('../../../../supabase/migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create function public.rls_auto_enable() returns void language plpgsql security definer set search_path = pg_catalog as $$ begin end $$;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  for (const f of files) {
    const sql = await readFile(new URL(f, dir), 'utf8');
    if (/create extension if not exists pg_cron/i.test(sql)) continue;
    await db.exec(sql);
  }
  return db;
}

export function pgliteStore(db: PGlite): CrmStore {
  async function q<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    try {
      return (await db.query<T>(sql, params)).rows;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '42501') throw new ForbiddenError();
      if (code === '22023') throw new BadInputError();
      throw error;
    }
  }
  const scalar = async <T>(sql: string, params: unknown[]): Promise<T> => ((await q<{ r: T }>(sql, params))[0] as { r: T }).r;
  const identity = (rows: StaffIdentity[]): StaffIdentity | null => (rows[0] ? { email: rows[0].email, role: rows[0].role, kinds: rows[0].kinds } : null);
  return {
    loginThrottle: (ip, subject) => scalar('select public.crm_login_throttle($1, $2) as r', [ip, subject]),
    async login(userId, email) {
      return identity(await q<StaffIdentity>('select * from public.crm_login($1, $2)', [userId, email]));
    },
    async whoami(userId) {
      return identity(await q<StaffIdentity>('select * from public.crm_whoami($1)', [userId]));
    },
    async recordEvent(actor, email, action) {
      await q('select public.crm_record_event($1, $2, $3)', [actor, email, action]);
    },
    async listLeads(actor, f) {
      const rows = await q<LeadRow & { total: number }>('select * from public.crm_list_leads($1, $2, $3, $4, $5, $6, $7, $8)', [actor, f.kind ?? null, f.status ?? null, f.from ?? null, f.to ?? null, f.q ?? null, f.limit, f.offset]);
      return { rows: rows.map(({ total: _t, ...row }) => ({ ...row, notes: Number(row.notes) })), total: Number(rows[0]?.total ?? 0) };
    },
    async getLead(actor, id) {
      return (await scalar<ReturnType<CrmStore['getLead']> extends Promise<infer R> ? R : never>('select public.crm_get_lead($1, $2) as r', [actor, id])) ?? null;
    },
    setStatus: (actor, id, from, to) => scalar<StatusResult>('select public.crm_set_status($1, $2, $3, $4) as r', [actor, id, from, to]),
    addNote: (actor, id, body) => scalar<'ok' | 'not_found'>('select public.crm_add_note($1, $2, $3) as r', [actor, id, body]),
    staffList: (actor) => q('select * from public.crm_staff_list($1)', [actor]) as ReturnType<CrmStore['staffList']>,
    staffUpsert: (actor, email, role, kinds, reset) => scalar('select public.crm_staff_upsert($1, $2, $3, $4::text[], $5) as r', [actor, email, role, kinds, reset]),
    staffSetActive: (actor, email, active) => scalar('select public.crm_staff_set_active($1, $2, $3) as r', [actor, email, active]),
  };
}

export interface FakeUser {
  email: string;
  password: string;
  id: string;
  confirmed?: boolean;
}

export function fakeAuth(initial: FakeUser[]) {
  const users = new Map(initial.map((u) => [u.email, { ...u, confirmed: u.confirmed ?? true }]));
  const sessions = new Map<string, { userId: string; refresh: string }>();
  const refreshTokens = new Map<string, string>();
  let counter = 0;
  const state = { down: false, calls: { signIn: 0, getUser: 0, refresh: 0, signOut: 0, signOutOthers: 0 } };
  const asUser = (u: FakeUser & { confirmed: boolean }): AuthUser => ({ id: u.id, email: u.email, confirmed: u.confirmed });
  const byId = (id: string) => [...users.values()].find((u) => u.id === id);
  const issue = (userId: string): TokenResult => {
    const user = byId(userId)!;
    const n = ++counter;
    const tokens = { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, user: asUser(user) };
    sessions.set(tokens.accessToken, { userId, refresh: tokens.refreshToken });
    refreshTokens.set(tokens.refreshToken, userId);
    return { ok: true, tokens };
  };
  const client: AuthClient = {
    async signIn(email, password) {
      state.calls.signIn++;
      if (state.down) return { ok: false, reason: 'unavailable' };
      const user = users.get(email);
      return user && user.password === password ? issue(user.id) : { ok: false, reason: 'invalid' };
    },
    async refresh(refreshToken) {
      state.calls.refresh++;
      if (state.down) return { ok: false, reason: 'unavailable' };
      const userId = refreshTokens.get(refreshToken);
      if (!userId) return { ok: false, reason: 'invalid' };
      refreshTokens.delete(refreshToken);
      return issue(userId);
    },
    async getUser(accessToken) {
      state.calls.getUser++;
      if (state.down) return { ok: false, reason: 'unavailable' };
      const session = sessions.get(accessToken);
      const user = session && byId(session.userId);
      return user ? { ok: true, user: asUser(user as FakeUser & { confirmed: boolean }) } : { ok: false, reason: 'invalid' };
    },
    async signOut(accessToken) {
      state.calls.signOut++;
      const session = sessions.get(accessToken);
      if (session) {
        refreshTokens.delete(session.refresh);
        sessions.delete(accessToken);
      }
    },
    async signOutOthers(accessToken) {
      state.calls.signOutOthers++;
      const mine = sessions.get(accessToken);
      if (!mine) return;
      for (const [token, other] of [...sessions]) {
        if (other.userId === mine.userId && token !== accessToken) {
          refreshTokens.delete(other.refresh);
          sessions.delete(token);
        }
      }
    },
    async updatePassword(accessToken, password) {
      const session = sessions.get(accessToken);
      const user = session && byId(session.userId);
      if (!user) return 'invalid';
      if (user.password === password) return 'same';
      if (/^(password|123456)/i.test(password)) return 'weak';
      users.get(user.email)!.password = password;
      return 'ok';
    },
  };
  return {
    client,
    state,
    /** The access token stops working, the refresh token still does (what an expired 1 h token looks like). */
    expireAccess: (accessToken: string) => void sessions.delete(accessToken),
    activeSessions: () => sessions.size,
    password: (email: string) => users.get(email)?.password,
  };
}

export interface Reply {
  status: number;
  headers: Headers;
  text: string;
  location: string | null;
}

/** Cookie-jar client around handleCrm. Same-origin form posts unless told otherwise. */
export function browser(deps: () => CrmDeps) {
  const jar = new Map<string, string>();
  const send = async (path: string, init: { method?: string; form?: Record<string, string | string[]>; headers?: Record<string, string>; origin?: string | null; ip?: string; raw?: string } = {}): Promise<Reply> => {
    const method = init.method ?? (init.form || init.raw !== undefined ? 'POST' : 'GET');
    const headers = new Headers(init.headers);
    if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '));
    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      if (init.origin !== null) headers.set('origin', init.origin ?? ORIGIN);
      if (!headers.has('sec-fetch-site')) headers.set('sec-fetch-site', 'same-origin');
      if (!headers.has('content-type')) headers.set('content-type', 'application/x-www-form-urlencoded');
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(init.form ?? {})) for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
      body = init.raw ?? params.toString();
    }
    const response = await handleCrm(new Request(`${ORIGIN}${path}`, { method, headers, body }), init.ip ?? '203.0.113.9', deps());
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at);
      const value = decodeURIComponent(pair.slice(at + 1));
      if (/Max-Age=0/i.test(line) || value === '') jar.delete(name);
      else jar.set(name, value);
    }
    return { status: response.status, headers: response.headers, text: await response.text(), location: response.headers.get('location') };
  };
  return { send, jar, setCookie: (name: string, value: string) => void jar.set(name, value), clear: () => jar.clear() };
}

export function captureLogs() {
  const lines: string[] = [];
  return { lines, log: createLogger('req-test', (line) => lines.push(line)) };
}
