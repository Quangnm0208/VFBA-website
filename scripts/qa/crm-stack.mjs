#!/usr/bin/env node
/**
 * Shared QA stack for the CRM: the REAL SQL (migrations in PGlite) behind an emulated PostgREST endpoint, an emulated Supabase
 * Auth (/auth/v1), and the compiled Vercel Function behind a plain HTTP host. Used by crm-function.mjs (HTTP level) and
 * crm-browser.mjs (Chromium). Nothing here talks to a real Supabase project.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import https from 'node:https';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// The emulated Supabase endpoint uses a throw-away self-signed certificate; QA processes accept it.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
export const HOST_SCRIPT = resolve('scripts/qa/api-function.mjs');
export const ENTRY = resolve('.vercel/output/functions/_render.func/.vercel/output/server/entry.mjs');
export const ORIGIN = 'https://www.example.test'; // the origin the host script gives every request
export const SERVICE_KEY = 'service-role-key-for-tests-only';
export const PUBLISHABLE_KEY = 'sb_publishable_for_tests_only';
export const SALT = 'salt-for-tests-only';
export const PASSWORD = 'Correct-Horse-Battery-1!';
export const BASE_ENV = { SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY, IP_HASH_SALT: SALT, CRM_ENABLED: 'true', LEADS_ENABLED: 'true', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', VBFA_QA_STUB_TURNSTILE: '1', NODE_TLS_REJECT_UNAUTHORIZED: '0' };

export async function startStack() {
  /* ───────── database: the real migrations in PGlite ───────── */
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create function public.rls_auto_enable() returns void language plpgsql security definer set search_path = pg_catalog as $$ begin end $$;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`);
  const migrationsDir = new URL('../../supabase/migrations/', import.meta.url);
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = readFileSync(new URL(f, migrationsDir), 'utf8');
    if (!/create extension if not exists pg_cron/i.test(sql)) await db.exec(sql);
  }

  /* ───────── users of the emulated Supabase Auth ───────── */
  const uid = (n) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
  const USERS = {
    admin: { email: 'admin@vbfa.test', id: uid(1) },
    staff: { email: 'staff@vbfa.test', id: uid(2) },
    news: { email: 'news@vbfa.test', id: uid(3) },
    outsider: { email: 'outsider@vbfa.test', id: uid(4) }, // valid Auth user, NOT on the allowlist
    pending: { email: 'pending@vbfa.test', id: uid(5), confirmed: false },
  };
  await db.exec(`insert into public.crm_staff (email, role, created_by) values ('admin@vbfa.test', 'admin', 'qa'), ('staff@vbfa.test', 'staff', 'qa');
    insert into public.crm_staff (email, role, kinds, created_by) values ('news@vbfa.test', 'staff', array['newsletter'], 'qa');`);

  /* ───────── emulated Supabase: GoTrue + PostgREST over HTTPS ───────── */
  const dir = mkdtempSync(join(tmpdir(), 'vbfa-crm-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });

  const sessions = new Map(); // access token -> { user, refresh }
  const refreshTokens = new Map(); // refresh token -> user
  let counter = 0;
  const seen = { requests: [], authKeyMisuse: 0, restKeyMisuse: 0 };
  const proc = new Map();
  async function describeFn(name) {
    if (!proc.has(name)) {
      const { rows } = await db.query("select proretset as set, prorettype::regtype::text as type from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [name]);
      proc.set(name, rows[0] ?? null);
    }
    return proc.get(name);
  }
  const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(body === undefined ? undefined : JSON.stringify(body)); };
  const bearer = (req) => /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
  function issue(user) {
    const n = ++counter;
    const access = `eyJ.access-${n}.sig`;
    const refresh = `refresh-token-${n}`;
    sessions.set(access, { user, refresh });
    refreshTokens.set(refresh, user);
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, user: { id: user.id, email: user.email, email_confirmed_at: user.confirmed === false ? null : '2026-10-01T00:00:00Z' } };
  }
  const server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    const url = new URL(req.url, 'https://x');
    seen.requests.push({ method: req.method, path: url.pathname, apikey: req.headers.apikey, auth: req.headers.authorization, body: text });
    try {
      if (url.pathname.startsWith('/auth/v1/')) {
        // Auth is called with the PUBLISHABLE key only; the service-role key must never be used for sign-in.
        if (req.headers.apikey !== PUBLISHABLE_KEY) { seen.authKeyMisuse++; return json(res, 401, { message: 'invalid api key' }); }
        const route = url.pathname.slice('/auth/v1'.length);
        if (route === '/token' && url.searchParams.get('grant_type') === 'password') {
          const { email, password } = JSON.parse(text || '{}');
          const user = Object.values(USERS).find((u) => u.email === email);
          if (!user || password !== PASSWORD) return json(res, 400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          return json(res, 200, issue(user));
        }
        if (route === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
          const { refresh_token } = JSON.parse(text || '{}');
          const user = refreshTokens.get(refresh_token);
          if (!user) return json(res, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
          refreshTokens.delete(refresh_token);
          return json(res, 200, issue(user));
        }
        if (route === '/user' && req.method === 'GET') {
          const session = sessions.get(bearer(req));
          if (!session) return json(res, 403, { error_code: 'session_not_found', msg: 'Session not found' });
          return json(res, 200, { id: session.user.id, email: session.user.email, email_confirmed_at: session.user.confirmed === false ? null : '2026-10-01T00:00:00Z' });
        }
        if (route === '/user' && req.method === 'PUT') {
          const session = sessions.get(bearer(req));
          if (!session) return json(res, 401, { msg: 'invalid' });
          return json(res, 200, { id: session.user.id });
        }
        if (route === '/logout') {
          const token = bearer(req);
          const session = sessions.get(token);
          if (session) { refreshTokens.delete(session.refresh); sessions.delete(token); }
          res.writeHead(204); return res.end();
        }
        return json(res, 404, { msg: 'not found' });
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        if (req.headers.apikey !== SERVICE_KEY || req.headers.authorization !== `Bearer ${SERVICE_KEY}`) { seen.restKeyMisuse++; return json(res, 401, { message: 'invalid key' }); }
        if (url.pathname === '/rest/v1/website_leads' && req.method === 'POST') {
          const row = JSON.parse(text);
          const keys = Object.keys(row);
          try {
            await db.query(`insert into public.website_leads (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row).map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : v)));
          } catch (error) { return json(res, error.code === '23505' ? 409 : 400, { code: error.code, message: error.message }); }
          res.writeHead(201); return res.end();
        }
        const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url.pathname);
        if (rpc && req.method === 'POST') {
          const fn = rpc[1];
          const meta = await describeFn(fn);
          if (!meta) return json(res, 404, { code: 'PGRST202', message: 'function not found' });
          const args = JSON.parse(text || '{}');
          const names = Object.keys(args);
          const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
          try {
            if (meta.set) return json(res, 200, (await db.query(`select * from ${call}`, Object.values(args))).rows);
            const { rows } = await db.query(`select ${call} as r`, Object.values(args));
            if (meta.type === 'void') { res.writeHead(204); return res.end(); }
            return json(res, 200, rows[0].r);
          } catch (error) {
            return json(res, error.code === '42501' ? 403 : error.code === '22023' ? 400 : 500, { code: error.code, message: error.message });
          }
        }
      }
      json(res, 404, { message: 'not found' });
    } catch (error) {
      json(res, 500, { message: String(error) });
    }
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const SUPABASE = `https://127.0.0.1:${server.address().port}`;

  /* ───────── the compiled function behind a plain HTTP host ───────── */
  async function startHost(env) {
    const child = spawn(process.execPath, [HOST_SCRIPT, '--host'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const logs = [];
    let port;
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('host did not start')), 20000);
      const onData = (chunk) => {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          const ready = /^HOST_READY (\d+)$/.exec(line);
          if (ready) { port = Number(ready[1]); clearTimeout(timer); ok(); } else logs.push(line);
        }
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('exit', () => fail(new Error(`host exited early: ${logs.join(' | ').slice(0, 300)}`)));
    });
    /** A browser: keeps cookies, never follows redirects (so 303s are visible), same-origin form posts by default. */
    const client = () => {
      const jar = new Map();
      const call = async (path, { method = 'GET', form, origin = ORIGIN, ip = '203.0.113.9', headers = {}, json: body } = {}) => {
        const h = { ...headers, 'x-test-ip': ip };
        if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
        let payload;
        if (form) { method = 'POST'; h['content-type'] = 'application/x-www-form-urlencoded'; h['sec-fetch-site'] ??= 'same-origin'; payload = new URLSearchParams(Object.entries(form).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))).toString(); }
        if (body !== undefined) { method = 'POST'; h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
        if (method === 'POST' && origin) h.origin = origin;
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: h, body: payload, redirect: 'manual' });
        const setCookies = response.headers.getSetCookie();
        for (const line of setCookies) {
          const [pair] = line.split(';');
          const at = pair.indexOf('=');
          const value = decodeURIComponent(pair.slice(at + 1));
          if (/Max-Age=0/i.test(line) || value === '') jar.delete(pair.slice(0, at)); else jar.set(pair.slice(0, at), value);
        }
        const textBody = await response.text();
        let parsed; try { parsed = JSON.parse(textBody); } catch { parsed = undefined; }
        return { status: response.status, headers: response.headers, text: textBody, json: parsed, location: response.headers.get('location'), setCookies };
      };
      return { call, jar };
    };
    return { client, logs, stop: () => child.kill() };
  }

  const q = async (sql, params = []) => (await db.query(sql, params)).rows;
  return { db, q, USERS, sessions, refreshTokens, seen, supabaseUrl: SUPABASE, startHost, env: (extra = {}) => ({ ...BASE_ENV, SUPABASE_URL: SUPABASE, ...extra }), close: async () => { server.close(); await db.close(); } };
}
