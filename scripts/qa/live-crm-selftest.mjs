#!/usr/bin/env node
/**
 * Dry run of live-crm-e2e.mjs against the LOCAL stack (compiled Function + real SQL in PGlite + emulated Auth), so the live
 * script's logic is proven before it is pointed at a real Preview. A pass here is NOT a real-service result.
 *
 *   npm run build && node scripts/qa/live-crm-selftest.mjs
 */
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { ACCOUNTS, derivePassword, runLiveCrm } from './live-crm-e2e.mjs';
import { ENTRY, ORIGIN, PUBLISHABLE_KEY, startStack } from './crm-stack.mjs';

if (!existsSync(ENTRY)) { console.error('No build output. Run `npm run build` first.'); process.exit(2); }
const SECRET = 'bypass-secret-for-the-selftest';
const run = 'selftest';
const users = Object.fromEntries(Object.entries(ACCOUNTS).map(([who, a], i) => [who, { email: a.email, id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, who }]));
const stack = await startStack({ users, passwordOf: (u) => derivePassword(SECRET, u.who), staffSql: Object.values(ACCOUNTS).filter((a) => a.role).map((a) => `insert into public.crm_staff (email, role, kinds, created_by) values ('${a.email}', '${a.role}', array[${a.kinds.map((k) => `'${k}'`).join(',')}], 'selftest');`).join('\n') });
const host = await stack.startHost(stack.env());
// The three rows the form tests of live-e2e.mjs would have stored.
await stack.q("insert into public.website_leads (kind, name, company, email, consent, consent_text_version, source_path) values ('membership','E2E Kiểm thử','VBFA E2E',$1,true,'join-v2','/')", [`e2e-member-${run}@example.invalid`]);
for (const n of ['news', 'ratelimit']) await stack.q("insert into public.website_leads (kind, email, consent, consent_text_version, source_path) values ('newsletter',$1,true,'newsletter-v1','/tin-tuc/')", [`e2e-${n}-${run}@example.invalid`]);

const root = resolve('.vercel/output/static');
const proxy = http.createServer(async (req, res) => {
  const file = normalize(join(root, new URL(req.url, 'http://x').pathname));
  if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) { res.writeHead(200, { 'content-type': extname(file) === '.css' ? 'text/css' : 'application/octet-stream' }); return res.end(readFileSync(file)); }
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = {}; for (const [k, v] of Object.entries(req.headers)) if (!['host', 'connection', 'content-length', 'x-vercel-protection-bypass'].includes(k)) headers[k] = String(v);
  if (headers.origin && headers.origin.startsWith('http://127.0.0.1')) headers.origin = ORIGIN; // QA shim (see crm-browser.mjs)
  headers['x-test-ip'] = '203.0.113.77';
  const r = await fetch(`http://127.0.0.1:${host.port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' });
  const out = Object.fromEntries([...r.headers].filter(([k]) => k !== 'set-cookie')); const cookies = r.headers.getSetCookie(); if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
});
await new Promise((ok) => proxy.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${proxy.address().port}`;
process.env.LIVE_E2E_SUPABASE_URL = stack.supabaseUrl;
process.env.LIVE_E2E_SUPABASE_PUBLISHABLE_KEY = PUBLISHABLE_KEY;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`); };
const state = await runLiveCrm({ base, bypass: SECRET, origin: base, run, email: (s) => `e2e-${s}-${run}@example.invalid`, check });
check('the live script reports that it ran', state === 'ran', state);
if (state !== 'ran') console.log(host.logs.filter((l) => /crm\./.test(l)).slice(0, 12).join('\n'));
proxy.close(); host.stop(); await stack.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (local self-test, not a real-service result)`);
process.exit(failed.length ? 1 : 0);
