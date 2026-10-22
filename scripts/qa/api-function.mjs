#!/usr/bin/env node
/**
 * Integration test of the COMPILED Vercel Function (.vercel/output/functions/_render.func): the real /api/join and
 * /api/newsletter routes with the real astro:env wiring and the real @supabase/supabase-js client.
 *
 *   npm run build && node scripts/qa/api-function.mjs
 *
 * What is real: the built bundle, the route handlers, request parsing, origin/size/type/shape checks, validation,
 * honeypot and time trap, rate limiting, hashing, logging, the supabase-js wire requests.
 * What is NOT real: the database. A small in-memory emulator of the PostgREST endpoints plays Supabase (HTTPS with a
 * throw-away self-signed certificate), so this proves the application's behaviour and request shapes, not that a
 * Supabase project accepts them. The real-database checklist lives in docs/OPERATIONS.md.
 *
 * Scenarios: no credentials (must fail closed); credentials present but the go-live switch or the salt missing (must fail
 * closed without contacting the database); fully configured against the emulator.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENTRY = resolve('.vercel/output/functions/_render.func/.vercel/output/server/entry.mjs');
const ORIGIN = 'https://www.example.test';
const SELF = fileURLToPath(import.meta.url);

/* ───────── host mode: expose the compiled function over plain HTTP ───────── */
if (process.argv[2] === '--host') {
  // Only this QA harness intercepts Turnstile. The deployed Function still calls the real Siteverify API.
  if (process.env.VBFA_QA_STUB_TURNSTILE === '1') {
    const fetchReal = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
        const params = new URLSearchParams(init?.body);
        const ok = params.get('secret') === '1x0000000000000000000000000000000AA' &&
          params.get('response') === 'XXXX.DUMMY.TOKEN.XXXX';
        return new Response(JSON.stringify({ success: ok }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return fetchReal(input, init);
    };
  }
  const entry = (await import(pathToFileURL(ENTRY).href)).default;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (key !== 'x-test-ip') headers.set(key, String(value));
    headers.set('x-forwarded-for', String(req.headers['x-test-ip'] ?? '198.51.100.7'));
    const request = new Request(ORIGIN + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await entry.fetch(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1', () => console.log(`HOST_READY ${server.address().port}`));
} else {
  await main();
}

async function main() {
  if (!existsSync(ENTRY)) {
    console.error('No build output. Run `npm run build` first.');
    process.exit(2);
  }
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
  };

  async function startHost(env) {
    const child = spawn(process.execPath, [SELF, '--host'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const logs = [];
    let port;
    await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('host did not start')), 20000);
      const onData = (stream) => (chunk) => {
        for (const line of chunk.toString().split('\n').filter(Boolean)) {
          const ready = /^HOST_READY (\d+)$/.exec(line);
          if (ready) { port = Number(ready[1]); clearTimeout(timer); ok(); } else logs.push(line);
        }
      };
      child.stdout.on('data', onData('out'));
      child.stderr.on('data', onData('err'));
      child.on('exit', () => fail(new Error(`host exited early: ${logs.join(' | ').slice(0, 300)}`)));
    });
    const call = async (path, { method = 'POST', body, headers = {}, ip, json = true, origin = ORIGIN } = {}) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { ...(origin ? { origin } : {}), ...(json ? { 'content-type': 'application/json' } : {}), ...(ip ? { 'x-test-ip': ip } : {}), ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed; try { parsed = JSON.parse(text); } catch { parsed = undefined; }
      return { status: response.status, headers: response.headers, text, json: parsed };
    };
    return { call, logs, stop: () => child.kill() };
  }

  const member = (over = {}) => ({ kind: 'membership', name: 'Nguyễn Văn Test', company: 'Công ty Kiểm thử', email: 'Test.User@Example.INVALID', phone: '+84 90 000 0000', interest: 'Quan tâm hội viên', message: 'Xin thông tin.', consent: true, consentVersion: 'join-v2', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', sourcePath: '/', openedAt: Date.now() - 30_000, website: '', utm: { utm_source: 'smoke', utm_medium: 'qa', secret_field: 'must-not-be-stored' }, ...over });
  const news = (over = {}) => ({ kind: 'newsletter', consent: true, consentVersion: 'newsletter-v1', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', email: 'reader@example.invalid', sourcePath: '/tin-tuc/', openedAt: Date.now() - 30_000, website: '', ...over });

  /* ───────── scenario 1: no credentials -> fail closed ───────── */
  {
    const host = await startHost({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', IP_HASH_SALT: '', LEADS_ENABLED: '', TURNSTILE_SECRET_KEY: '' });
    for (const route of ['/api/join/', '/api/newsletter/']) {
      const get = await host.call(route, { method: 'GET', json: false });
      check(`${route} GET -> 405 with Allow: POST and no-store JSON`, get.status === 405 && /POST/.test(get.headers.get('allow') ?? '') && /no-store/.test(get.headers.get('cache-control') ?? '') && get.json?.ok === false, `${get.status} ${get.text.slice(0, 80)}`);
      for (const method of ['PUT', 'DELETE', 'PATCH']) check(`${route} ${method} -> 405`, (await host.call(route, { method, body: '{}' })).status === 405);
      check(`${route} text/plain -> 415`, (await host.call(route, { body: 'a=b', json: false, headers: { 'content-type': 'text/plain' } })).status === 415);
      check(`${route} malformed JSON -> 400`, (await host.call(route, { body: '{not json' })).status === 400);
      check(`${route} foreign origin -> 403`, (await host.call(route, { body: '{}', origin: 'https://evil.example' })).status === 403);
      check(`${route} missing Origin -> 403`, (await host.call(route, { body: '{}', origin: null })).status === 403);
      check(`${route} body over 8 KB -> 413`, (await host.call(route, { body: JSON.stringify({ pad: 'x'.repeat(9000) }) })).status === 413);
    }
    const bad = await host.call('/api/join/', { body: member({ email: 'nope' }) });
    check('join: invalid email -> 400 with a Vietnamese message and field map', bad.status === 400 && bad.json?.fields?.email && /email/i.test(bad.json.message), bad.text.slice(0, 120));
    const noConsent = await host.call('/api/join/', { body: member({ consent: false }) });
    check('join: missing consent -> 400 (consent field)', noConsent.status === 400 && noConsent.json?.fields?.consent);
    check('join: honeypot answers 200 ok without any backend', (await host.call('/api/join/', { body: member({ website: 'http://spam.example' }) })).status === 200);
    const valid = await host.call('/api/join/', { body: member() });
    check('join: a VALID submission is refused with 503 when credentials are absent (fail closed)', valid.status === 503 && valid.json?.code === 'unavailable', `${valid.status} ${valid.text.slice(0, 100)}`);
    check('newsletter: a VALID submission is refused with 503 when credentials are absent', (await host.call('/api/newsletter/', { body: news() })).status === 503);
    host.stop();
  }

  /* ───────── in-memory PostgREST emulator (HTTPS, throw-away certificate) ───────── */
  const dir = mkdtempSync(join(tmpdir(), 'vbfa-api-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
  async function startEmulator() {
    const rows = [];
    const attempts = [];
    const seen = { requests: [], delayMs: 0, failWith: 0 };
    const seconds = (interval) => Number(/(\d+)\s*seconds?/.exec(String(interval))?.[1] ?? 600);
    const server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      seen.requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, apikey: req.headers.apikey, body });
      if (seen.delayMs) await new Promise((r) => setTimeout(r, seen.delayMs));
      if (seen.failWith) { res.writeHead(seen.failWith, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ message: 'emulated outage' })); }
      const url = new URL(req.url, 'https://x');
      // POST /rest/v1/rpc/register_attempt: same decision as supabase/migrations/0002_form_throttle.sql
      if (req.method === 'POST' && url.pathname.endsWith('/rest/v1/rpc/register_attempt')) {
        const a = JSON.parse(body);
        const since = Date.now() - seconds(a.p_window) * 1000;
        attempts.push({ hash: a.p_ip_hash, kind: a.p_kind, at: Date.now() });
        const n = attempts.filter((x) => x.hash === a.p_ip_hash && x.at > since).length;
        const l = rows.filter((r) => r.ip_hash === a.p_ip_hash && Date.parse(r.created_at) > since).length;
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(n > a.p_max_attempts ? 'attempts' : l >= a.p_max_leads ? 'leads' : 'ok'));
      }
      if (url.pathname.endsWith('/rest/v1/website_leads') && req.method === 'POST') {
        const row = JSON.parse(body);
        const dup = row.kind === 'newsletter' && rows.some((r) => r.kind === 'newsletter' && r.email.toLowerCase() === row.email.toLowerCase());
        if (dup) { res.writeHead(409, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "website_leads_newsletter_email_uq"' })); }
        rows.push({ ...row, created_at: new Date().toISOString() });
        res.writeHead(201); return res.end();
      }
      res.writeHead(404); res.end();
    });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    return { rows, attempts, seen, url: `https://127.0.0.1:${server.address().port}`, stop: () => server.close() };
  }
  const SERVICE_KEY = 'service-role-key-for-tests-only';
  const SALT = 'salt-for-tests-only';
  const configured = (emulator, extra = {}) => ({ SUPABASE_URL: emulator.url, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, IP_HASH_SALT: SALT, LEADS_ENABLED: 'true', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', VBFA_QA_STUB_TURNSTILE: '1', NODE_TLS_REJECT_UNAUTHORIZED: '0', ...extra });

  /* ───────── scenario 2: the go-live switch and the salt are both required ───────── */
  {
    const emulator = await startEmulator();
    for (const [label, extra] of [['LEADS_ENABLED is not "true"', { LEADS_ENABLED: '' }], ['LEADS_ENABLED=false', { LEADS_ENABLED: 'false' }], ['IP_HASH_SALT is missing', { IP_HASH_SALT: '' }]]) {
      const host = await startHost(configured(emulator, extra));
      const res = await host.call('/api/join/', { body: member(), ip: '203.0.113.50' });
      check(`${label} (credentials otherwise present) -> 503 and the database is never contacted`, res.status === 503 && res.json?.code === 'unavailable' && emulator.seen.requests.length === 0 && emulator.rows.length === 0, `${res.status}, ${emulator.seen.requests.length} backend requests`);
      host.stop();
    }
    emulator.stop();
  }

  /* ───────── scenario 3: fully configured against the emulator ───────── */
  {
    const emulator = await startEmulator();
    const { rows, seen } = emulator;
    const host = await startHost(configured(emulator));

    const r1 = await host.call('/api/join/', { body: member(), ip: '203.0.113.10' });
    check('join: valid submission -> 200 {ok:true}', r1.status === 200 && r1.json?.ok === true, `${r1.status} ${r1.text.slice(0, 100)}`);
    const row = rows.find((r) => r.kind === 'membership');
    check('join: exactly one row stored after the 200 (success only after persistence)', rows.filter((r) => r.kind === 'membership').length === 1);
    check('join: row has normalised email, consent=true, consent version, source path', row?.email === 'test.user@example.invalid' && row.consent === true && row.consent_text_version === 'join-v2' && row.source_path === '/', JSON.stringify(row));
    check('join: only allow-listed UTM keys are stored', JSON.stringify(row?.utm) === JSON.stringify({ utm_source: 'smoke', utm_medium: 'qa' }), JSON.stringify(row?.utm));
    check('join: IP is stored only as a 128-bit salted HMAC (32 hex), never raw', /^[0-9a-f]{32}$/.test(row?.ip_hash ?? '') && !JSON.stringify(row).includes('203.0.113.10'));
    check('every database call authenticates with the service-role key and only that key (server side)', seen.requests.length > 0 && seen.requests.every((q) => q.apikey === SERVICE_KEY && q.auth === `Bearer ${SERVICE_KEY}`));
    check('a successful submission costs exactly two database calls (attempt check + insert)', seen.requests.length === 2, `${seen.requests.length}: ${seen.requests.map((q) => q.method + ' ' + new URL(q.url, 'https://x').pathname.split('/').pop()).join(', ')}`);

    const noConsent = await host.call('/api/newsletter/', { body: news({ consent: false }) });
    check('newsletter: no explicit consent -> 400, no newsletter row', noConsent.status === 400 && rows.filter((r) => r.kind === 'newsletter').length === 0);
    const wrongVersion = await host.call('/api/newsletter/', { body: news({ consentVersion: 'unreviewed-v99' }) });
    check('newsletter: unapproved consent version -> 400', wrongVersion.status === 400);

    const before = rows.length;
    const callsBefore = seen.requests.length;
    check('join: invalid submission -> 400 and NO row and NO database call', (await host.call('/api/join/', { body: member({ email: 'nope' }) })).status === 400 && rows.length === before && seen.requests.length === callsBefore);
    check('join: missing consent -> 400 and NO row', (await host.call('/api/join/', { body: member({ consent: false }) })).status === 400 && rows.length === before);
    const silent = await host.call('/api/join/', { body: member({ website: 'bot' }) });
    const instant = await host.call('/api/join/', { body: member({ openedAt: Date.now() - 200 }) });
    check('bots: honeypot and instant submissions get 200, NOTHING is stored and the database is not touched', silent.status === 200 && instant.status === 200 && rows.length === before && seen.requests.length === callsBefore);

    const withQuery = await host.call('/api/newsletter/', { body: news({ email: 'path@example.invalid', sourcePath: '/tin-tuc/?email=a@b.c&t=1#x' }), ip: '203.0.113.19' });
    check('source path is stored without its query string or fragment', withQuery.status === 200 && rows.find((r) => r.email === 'path@example.invalid')?.source_path === '/tin-tuc/');

    const n1 = await host.call('/api/newsletter/', { body: news({ email: 'Reader@Example.invalid' }), ip: '203.0.113.20' });
    const n2 = await host.call('/api/newsletter/', { body: news({ email: 'reader@example.INVALID' }), ip: '203.0.113.21' });
    check('newsletter: first and repeated submissions both answer 200 with identical bodies', n1.status === 200 && n2.status === 200 && n1.text === n2.text, `${n1.text} / ${n2.text}`);
    check('newsletter: exactly one subscription row for the address (duplicates do not create rows)', rows.filter((r) => r.kind === 'newsletter' && r.email === 'reader@example.invalid').length === 1);

    for (let i = 0; i < 5; i++) await host.call('/api/newsletter/', { body: news({ email: `rate${i}@example.invalid` }), ip: '203.0.113.30' });
    const limited = await host.call('/api/newsletter/', { body: news({ email: 'rate-over@example.invalid' }), ip: '203.0.113.30' });
    const other = await host.call('/api/newsletter/', { body: news({ email: 'rate-other@example.invalid' }), ip: '203.0.113.31' });
    check('rate limit: the sixth stored lead from one address -> 429, another address is unaffected', limited.status === 429 && other.status === 200, `${limited.status}/${other.status}`);
    check('rate limit: the refused request stored nothing', !rows.some((r) => r.email === 'rate-over@example.invalid'));

    const dupStatuses = [];
    for (let i = 0; i < 17; i++) dupStatuses.push((await host.call('/api/newsletter/', { body: news({ email: 'same@example.invalid' }), ip: '203.0.113.60' })).status);
    check('attempt limit: repeated duplicate submissions (nothing stored) are throttled after 15 -> 429', dupStatuses.slice(0, 15).every((x) => x === 200) && dupStatuses.slice(15).every((x) => x === 429), dupStatuses.join(','));
    check('attempt limit: the duplicates created a single row', rows.filter((r) => r.email === 'same@example.invalid').length === 1);

    const tmp = rows.length;
    seen.failWith = 503;
    const down = await host.call('/api/newsletter/', { body: news({ email: 'down@example.invalid' }), ip: '203.0.113.40' });
    check('Supabase answers 5xx -> 503 for the visitor, no success claimed, no leak', down.status === 503 && down.json?.code === 'unavailable' && !down.text.includes(SERVICE_KEY) && !down.text.includes('127.0.0.1'), `${down.status} ${down.text.slice(0, 100)}`);
    seen.failWith = 0;
    check('nothing was stored while Supabase was failing', rows.length === tmp);

    seen.delayMs = 6000;
    const t0 = Date.now();
    const slow = await host.call('/api/newsletter/', { body: news({ email: 'slow@example.invalid' }), ip: '203.0.113.41' });
    const took = Date.now() - t0;
    check('Supabase hangs -> our JSON 503 after ~3 s, well inside the 10 s Function limit', slow.status === 503 && slow.json?.code === 'unavailable' && took >= 2500 && took < 5000, `${slow.status} after ${took} ms`);
    seen.delayMs = 0;
    check('nothing was stored while Supabase was hanging', !rows.some((r) => r.email === 'slow@example.invalid'));

    emulator.stop();
    const gone = await host.call('/api/newsletter/', { body: news({ email: 'gone@example.invalid' }), ip: '203.0.113.42' });
    check('Supabase unreachable (connection refused) -> 503, no success claimed', gone.status === 503, `${gone.status} ${gone.text.slice(0, 100)}`);

    const log = host.logs.join('\n').toLowerCase();
    const pii = ['Nguyễn Văn Test', 'Công ty Kiểm thử', 'test.user@example.invalid', 'reader@example.invalid', 'same@example.invalid', '203.0.113.10', '203.0.113.20', '203.0.113.60', SERVICE_KEY, SALT, '+84 90'];
    const leaked = pii.filter((value) => log.includes(value.toLowerCase()));
    check('technical log contains no personal data, addresses or secrets', leaked.length === 0 && host.logs.length > 0, `leaked: ${leaked.join(', ')} (log lines: ${host.logs.length})`);
    host.stop();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed (database emulated; see header comment)`);
  process.exit(failed.length ? 1 : 0);
}
