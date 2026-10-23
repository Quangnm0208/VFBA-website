#!/usr/bin/env node
/**
 * Integration test of the COMPILED Vercel Function for the CRM (/admin/*) together with the form API, wired like production:
 * the real built bundle, the real astro:env wiring, the real @supabase/supabase-js client, real HTTP cookies.
 *
 *   npm run build && node scripts/qa/crm-function.mjs
 *
 * What is real: the compiled function, routing, session cookies, authorization, throttling, the SQL functions of migration 0007
 * (they run in PGlite, an in-process Postgres built from supabase/migrations, behind an emulated PostgREST endpoint).
 * What is NOT real: Supabase Auth (a small in-memory emulation of /auth/v1) and Postgres/PostgREST themselves. The real-service
 * run (docs/evidence/CRM_REAL_*.md) covers those against the live project.
 */
import { existsSync } from 'node:fs';
import { ENTRY, ORIGIN, PASSWORD, PUBLISHABLE_KEY, SALT, SERVICE_KEY, startStack } from './crm-stack.mjs';

if (!existsSync(ENTRY)) {
  console.error('No build output. Run `npm run build` first.');
  process.exit(2);
}
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};

const stack = await startStack();
const { USERS, sessions, seen, q, startHost } = stack;
const base = stack.env();
const SUPABASE = stack.supabaseUrl;
const login = async (c, who, password = PASSWORD, extra = {}) => c.call('/admin/login/', { form: { email: USERS[who].email, password, ...extra } });

/* ───────── scenario 1: switched off or misconfigured -> the area does not exist / fails closed ───────── */
for (const [label, env, status] of [
  ['CRM_ENABLED is absent', { CRM_ENABLED: '' }, 404],
  ['CRM_ENABLED=false', { CRM_ENABLED: 'false' }, 404],
  ['the publishable key is missing', { SUPABASE_PUBLISHABLE_KEY: '' }, 503],
  ['the salt is missing', { IP_HASH_SALT: '' }, 503],
  ['the service-role key is missing', { SUPABASE_SERVICE_ROLE_KEY: '' }, 503],
  ['Supabase is not HTTPS', { SUPABASE_URL: 'http://127.0.0.1:1' }, 503],
]) {
  const host = await startHost({ ...base, ...env });
  const before = seen.requests.length;
  const c = host.client();
  const get = await c.call('/admin/leads/');
  const post = await c.call('/admin/login/', { form: { email: USERS.staff.email, password: PASSWORD } });
  check(`${label} -> /admin/* answers ${status} and the backend is never contacted`, get.status === status && post.status === status && seen.requests.length === before, `${get.status}/${post.status}, ${seen.requests.length - before} backend requests`);
  check(`${label} -> the answer is still no-store and noindex`, /no-store/.test(get.headers.get('cache-control') ?? '') && /noindex/.test(get.headers.get('x-robots-tag') ?? ''));
  host.stop();
}

/* ───────── scenario 2: fully configured ───────── */
const host = await startHost(base);
const anon = host.client();

const home = await anon.call('/admin/');
check('GET /admin/ without a session -> 401 login page (not data, not a redirect loop)', home.status === 401 && /Đăng nhập CRM/.test(home.text), `${home.status}`);
const protectedPaths = ['/admin/leads/', '/admin/leads/00000000-0000-4000-8000-000000000001/', '/admin/staff/', '/admin/account/'];
const protectedAnswers = await Promise.all(protectedPaths.map((p) => anon.call(p)));
check('every protected page answers 401 to an anonymous visitor', protectedAnswers.every((r) => r.status === 401), protectedAnswers.map((r) => r.status).join(','));
const postNoSession = await anon.call('/admin/leads/00000000-0000-4000-8000-000000000001/status/', { form: { from: 'new', to: 'closed' } });
check('a state-changing post without a session answers 401', postNoSession.status === 401);
const bareAdmin = await anon.call('/admin');
check('/admin (no trailing slash) does not serve the CRM', bareAdmin.status === 308 || bareAdmin.status === 301 || bareAdmin.status === 303 || bareAdmin.status === 404, String(bareAdmin.status));
check('unknown /admin/ path -> 404, unknown method -> 405 with Allow', (await anon.call('/admin/nope/')).status === 404 && (await anon.call('/admin/leads/', { method: 'PUT', origin: ORIGIN })).status === 405);

// Sign-in
const wrongPassword = await login(anon, 'staff', 'wrong-password');
const unknownUser = await anon.call('/admin/login/', { form: { email: 'ghost@vbfa.test', password: PASSWORD } });
const notStaff = await login(anon, 'outsider');
const unconfirmed = await login(anon, 'pending');
const normalise = (r) => r.text.replace(/value="[^"]*"/g, '');
check('wrong password, unknown e-mail, valid-but-not-staff and unconfirmed accounts all get the same 401 answer', [wrongPassword, unknownUser, notStaff, unconfirmed].every((r) => r.status === 401) && new Set([wrongPassword, unknownUser, notStaff, unconfirmed].map(normalise)).size === 1);
check('the not-staff attempt left no Auth session behind (revoked) and a denied event in the audit trail', sessions.size === 0 && (await q("select 1 from public.crm_audit_log where action = 'denied' and actor_email = 'outsider@vbfa.test'")).length === 1);

const staff = host.client();
const loginOk = await login(staff, 'staff');
check('a staff member signs in: 303 to the Lead Inbox with three hardened cookies', loginOk.status === 303 && loginOk.location === '/admin/leads/' && loginOk.setCookies.length === 3 && loginOk.setCookies.every((c) => /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Strict/.test(c) && /Path=\/admin/.test(c) && /Max-Age=\d+/.test(c)), loginOk.setCookies.join(' | ').slice(0, 300));
check('Auth was called with the publishable key only, and the database with the service-role key only', seen.authKeyMisuse === 0 && seen.restKeyMisuse === 0 && seen.requests.filter((r) => r.path.startsWith('/auth/')).every((r) => r.apikey === PUBLISHABLE_KEY) && seen.requests.filter((r) => r.path.startsWith('/rest/')).every((r) => r.apikey === SERVICE_KEY));
const empty = await staff.call('/admin/leads/');
check('the Lead Inbox is reachable once signed in (empty list at first)', empty.status === 200 && /Chưa có khách nào gửi biểu mẫu/.test(empty.text), `${empty.status}`);
const leaks = [wrongPassword, loginOk, empty].flatMap((r) => [SERVICE_KEY, PUBLISHABLE_KEY, SALT].filter((secret) => r.text.includes(secret) || JSON.stringify([...r.headers].filter(([name]) => name !== 'set-cookie')).includes(secret)));
check('no response body or header ever contains a key or the salt (tokens appear only in HttpOnly cookies)', leaks.length === 0 && !wrongPassword.text.includes('access-') && !empty.text.includes('access-') && !empty.text.includes('refresh-token'), leaks.join(', '));

// Form -> CRM consistency (the real /api/join/ and /api/newsletter/ in the same compiled function)
const visitor = host.client();
const member = { kind: 'membership', name: 'Nguyễn Văn Kiểm Thử', company: 'Công ty <b>Thử</b>', email: 'Member.One@Example.invalid', phone: '+84 90 000 0000', interest: 'Quan tâm hội viên', message: 'Xin thông tin & báo giá.', consent: true, consentVersion: 'join-v2', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', sourcePath: '/', openedAt: Date.now() - 30_000, website: '', utm: { utm_source: 'qa' } };
const news = { kind: 'newsletter', consent: true, consentVersion: 'newsletter-v1', turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX', email: 'reader@example.invalid', sourcePath: '/tin-tuc/', openedAt: Date.now() - 30_000, website: '' };
const j1 = await visitor.call('/api/join/', { json: member, ip: '198.51.100.21' });
const n1 = await visitor.call('/api/newsletter/', { json: news, ip: '198.51.100.22' });
check('the public forms still work next to the CRM (200 each)', j1.status === 200 && n1.status === 200, `${j1.status}/${n1.status}`);
const list = await staff.call('/admin/leads/');
check('both submissions appear in the CRM, newest first, with the exact stored values', list.status === 200 && /member\.one@example\.invalid/.test(list.text) && /reader@example\.invalid/.test(list.text) && list.text.indexOf('reader@example.invalid') < list.text.indexOf('member.one@example.invalid') && /Hiển thị 1–2 trong 2 kết quả/.test(list.text), list.text.slice(0, 200));
check('markup in a submission is shown as text, never as markup', /Công ty &lt;b&gt;Thử&lt;\/b&gt;/.test((await staff.call('/admin/leads/?q=member.one')).text) && !/<b>Thử<\/b>/.test(list.text));
const leadId = (await q("select id from public.website_leads where kind = 'membership'"))[0].id;
const detail = await staff.call(`/admin/leads/${leadId}/`);
check('the lead detail shows the consent version, the consent time and the source page', detail.status === 200 && /join-v2/.test(detail.text) && /Thời điểm đồng ý/.test(detail.text) && /<code>\/<\/code>/.test(detail.text) && /utm_source=qa/.test(detail.text) && !/ip_hash/.test(detail.text));

// Workflow
const toProgress = await staff.call(`/admin/leads/${leadId}/status/`, { form: { from: 'new', to: 'contacted' } });
check('staff moves the lead New -> In progress (303 back to the lead)', toProgress.status === 303 && toProgress.location === `/admin/leads/${leadId}/?done=status`);
check('database readback: status is "contacted" and updated_at moved past created_at', (await q('select status, updated_at > created_at as moved from public.website_leads where id = $1', [leadId]))[0].status === 'contacted');
const stale = await staff.call(`/admin/leads/${leadId}/status/`, { form: { from: 'new', to: 'closed' } });
check('a stale form is a conflict, not an overwrite', stale.location === `/admin/leads/${leadId}/?done=conflict` && (await q('select status from public.website_leads where id = $1', [leadId]))[0].status === 'contacted');
const noteBody = 'Đã gọi điện, hẹn gặp thứ Sáu.\nGhi chú nội bộ.';
const addNote = await staff.call(`/admin/leads/${leadId}/note/`, { form: { body: noteBody } });
const withNote = await staff.call(addNote.location);
check('staff adds an internal note: it shows author, time and the text', addNote.status === 303 && /Đã gọi điện, hẹn gặp thứ Sáu\./.test(withNote.text) && /staff@vbfa\.test/.test(withNote.text) && /<time datetime=/.test(withNote.text));
check('database readback: one note, author taken from the verified identity', (await q('select author_email, body from public.lead_notes where lead_id = $1', [leadId])).length === 1 && (await q('select author_email from public.lead_notes where lead_id = $1', [leadId]))[0].author_email === 'staff@vbfa.test');
const closed = await staff.call(`/admin/leads/${leadId}/status/`, { form: { from: 'contacted', to: 'closed' } });
check('staff closes the lead: status "closed" in the database', closed.status === 303 && (await q('select status from public.website_leads where id = $1', [leadId]))[0].status === 'closed');
check('filters work through the compiled function (status, kind, search, dates)', /Hiển thị 1–1 trong 1 kết quả/.test((await staff.call('/admin/leads/?status=closed')).text) && /reader@example\.invalid/.test((await staff.call('/admin/leads/?kind=newsletter')).text) && !/reader@example\.invalid/.test((await staff.call('/admin/leads/?q=member')).text));
check('the audit trail recorded sign-in, view, status change and note without any lead data', (await q("select count(distinct action)::int as n from public.crm_audit_log where action in ('login','lead_view','lead_status','lead_note')"))[0].n === 4 && !JSON.stringify(await q('select detail, actor_email from public.crm_audit_log')).match(/Nguyễn|member\.one|Đã gọi|reader@/i));

// Authorization: unauthorized users can neither read nor modify
const outsider = host.client();
{
  // A valid Auth session that is not on the allowlist: sign in at the Auth server directly, then present the cookies.
  const direct = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: PUBLISHABLE_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: USERS.outsider.email, password: PASSWORD }) });
  const tokens = await direct.json();
  const clock = staff.jar.get('__Secure-vbfa-ss'); // a genuine signed clock; the Auth tokens are what differ
  outsider.jar.set('__Secure-vbfa-at', tokens.access_token);
  outsider.jar.set('__Secure-vbfa-rt', tokens.refresh_token);
  outsider.jar.set('__Secure-vbfa-ss', clock);
}
const outsiderList = await outsider.call('/admin/leads/');
check('a valid Auth user who is not staff gets 403 and sees no lead', outsiderList.status === 403 && !/example\.invalid/.test(outsiderList.text));
const outsiderWrite = await outsider.call(`/admin/leads/${leadId}/status/`, { form: { from: 'closed', to: 'new' } });
const outsiderNote = await outsider.call(`/admin/leads/${leadId}/note/`, { form: { body: 'intruder' } });
check('the same user cannot change a status or add a note (403) and nothing changed', outsiderWrite.status === 403 && outsiderNote.status === 403 && (await q('select status from public.website_leads where id = $1', [leadId]))[0].status === 'closed' && (await q('select 1 from public.lead_notes where body = $1', ['intruder'])).length === 0);

const newsOnly = host.client();
await login(newsOnly, 'news');
const newsList = await newsOnly.call('/admin/leads/');
check('a newsletter-only person sees only newsletter leads', newsList.status === 200 && /reader@example\.invalid/.test(newsList.text) && !/member\.one/.test(newsList.text));
const idor = [await newsOnly.call(`/admin/leads/${leadId}/`), await newsOnly.call(`/admin/leads/${leadId}/status/`, { form: { from: 'closed', to: 'new' } }), await newsOnly.call(`/admin/leads/${leadId}/note/`, { form: { body: 'idor' } })];
check('IDOR: the same person gets 404 for a membership lead (read, status, note) and nothing changed', idor.every((r) => r.status === 404) && (await q('select status from public.website_leads where id = $1', [leadId]))[0].status === 'closed' && (await q("select 1 from public.lead_notes where body = 'idor'")).length === 0);

const staffAdmin = [await staff.call('/admin/staff/'), await staff.call('/admin/staff/', { form: { action: 'upsert', email: 'new.admin@vbfa.test', role: 'admin', kind: ['membership'] } })];
check('RBAC: staff cannot open or use staff management (403) and no row was added', staffAdmin.every((r) => r.status === 403) && (await q("select 1 from public.crm_staff where email = 'new.admin@vbfa.test'")).length === 0);
const admin = host.client();
await login(admin, 'admin');
const staffPage = await admin.call('/admin/staff/');
const added = await admin.call('/admin/staff/', { form: { action: 'upsert', email: 'Trainee@VBFA.test', role: 'staff', kind: ['contact'] } });
check('an administrator opens staff management and grants a role and scope', staffPage.status === 200 && /staff@vbfa\.test/.test(staffPage.text) && added.location === '/admin/staff/?done=upsert_created' && (await q("select role, kinds from public.crm_staff where email = 'trainee@vbfa.test'"))[0].role === 'staff');
check('the last administrator cannot be removed', (await admin.call('/admin/staff/', { form: { action: 'deactivate', email: USERS.admin.email } })).location === '/admin/staff/?done=last_admin');
const deact = await admin.call('/admin/staff/', { form: { action: 'deactivate', email: USERS.staff.email } });
const afterDeact = await staff.call('/admin/leads/');
check('deactivating a person locks them out on their next request (403)', deact.location === '/admin/staff/?done=deactivated' && afterDeact.status === 403);
await admin.call('/admin/staff/', { form: { action: 'activate', email: USERS.staff.email } });
check('and re-enabling lets them back in without a new sign-in', (await staff.call('/admin/leads/')).status === 200);

// Same-origin enforcement
const csrf = [
  await staff.call(`/admin/leads/${leadId}/status/`, { form: { from: 'closed', to: 'new' }, origin: 'https://evil.example' }),
  await staff.call(`/admin/leads/${leadId}/status/`, { form: { from: 'closed', to: 'new' }, origin: null }),
  await staff.call(`/admin/leads/${leadId}/status/`, { form: { from: 'closed', to: 'new' }, headers: { 'sec-fetch-site': 'cross-site' } }),
  await staff.call('/admin/login/', { method: 'POST', origin: ORIGIN, headers: { 'content-type': 'text/plain' } }),
];
check('CSRF: foreign Origin, missing Origin, cross-site fetch metadata and non-form content are refused; nothing changed', csrf.map((r) => r.status).join() === '403,403,403,415' && (await q('select status from public.website_leads where id = $1', [leadId]))[0].status === 'closed', csrf.map((r) => r.status).join());

// Session lifecycle
const copy = host.client();
const second = host.client();
await login(second, 'admin');
for (const [k, v] of second.jar) copy.jar.set(k, v);
const secondAccess = second.jar.get('__Secure-vbfa-at');
const bye = await second.call('/admin/logout/', { form: {} });
check('logout clears the cookies and revokes the Auth session', bye.status === 303 && bye.location === '/admin/login/?done=out' && bye.setCookies.length === 3 && bye.setCookies.every((c) => /Max-Age=0/.test(c)) && secondAccess && !sessions.has(secondAccess));
const replay = await copy.call('/admin/leads/');
check('a copied cookie stops working after logout (replay -> 401)', replay.status === 401);
const forged = host.client();
forged.jar.set('__Secure-vbfa-at', 'eyJ.access-forged.sig');
forged.jar.set('__Secure-vbfa-rt', 'refresh-token-forged');
forged.jar.set('__Secure-vbfa-ss', `${Date.now()}.${Date.now()}.${'0'.repeat(64)}`);
check('forged tokens and a forged session clock are rejected (401)', (await forged.call('/admin/leads/')).status === 401);
const renew = host.client();
await login(renew, 'staff');
const oldAccess = renew.jar.get('__Secure-vbfa-at');
sessions.delete(oldAccess); // the 1 h access token expired; the refresh token still lives
const renewed = await renew.call('/admin/leads/');
check('an expired access token is renewed with the refresh token and the cookies rotate', renewed.status === 200 && renew.jar.get('__Secure-vbfa-at') !== oldAccess && renewed.setCookies.some((c) => c.startsWith('__Secure-vbfa-at=')));

// Throttle
const brute = host.client();
const statuses = [];
for (let i = 0; i < 10; i++) statuses.push((await brute.call('/admin/login/', { form: { email: 'victim@vbfa.test', password: `guess-${i}` }, ip: `192.0.2.${i + 1}` })).status);
check('sign-in throttle: repeated guesses against one e-mail (from different addresses) end in 429 with Retry-After', statuses.slice(0, 8).every((s) => s === 401) && statuses.slice(8).every((s) => s === 429), statuses.join(','));

// Headers on everything
const everything = [home, ...protectedAnswers, loginOk, empty, list, detail, withNote, outsiderList, newsList, staffPage, await admin.call('/admin/account/'), await anon.call('/admin/login/')];
const sample = everything.filter((r) => r.status !== 303);
check('every CRM response is private, no-store and noindex, framed by nobody, with a script-free CSP', everything.every((r) => r.headers.get('cache-control') === 'private, no-store, max-age=0' && /noindex/.test(r.headers.get('x-robots-tag') ?? '') && r.headers.get('x-frame-options') === 'DENY' && /default-src 'none'/.test(r.headers.get('content-security-policy') ?? '') && !/script-src|unsafe-/.test(r.headers.get('content-security-policy') ?? '')));
check('no CRM page contains a script, an inline style or an event handler; each links the same-origin stylesheet', sample.every((r) => !/<script|<style|\sstyle=|\son[a-z]+=|javascript:/i.test(r.text) && r.text.includes('href="/admin/crm.css"') && /name="robots" content="noindex/.test(r.text)));

// Logs
const lines = host.logs.join('\n');
const forbidden = ['member.one', 'reader@example', 'Nguyễn Văn Kiểm Thử', 'Đã gọi điện', 'staff@vbfa.test', 'admin@vbfa.test', 'victim@vbfa.test', PASSWORD, 'guess-', SERVICE_KEY, PUBLISHABLE_KEY, 'access-', 'refresh-token', '198.51.100.', '192.0.2.', '203.0.113.'];
check('the function logs carry events but no e-mail, name, note, password, token, key or address', host.logs.some((l) => /"event":"crm\./.test(l)) && forbidden.every((s) => !lines.includes(s)), forbidden.filter((s) => lines.includes(s)).join(', '));
host.stop();

/* ───────── scenario 3: the database is down -> 503, never a stack trace ───────── */
{
  const down = await startHost({ ...base, SUPABASE_URL: 'https://127.0.0.1:9' });
  const c = down.client();
  const r = await c.call('/admin/login/', { form: { email: USERS.staff.email, password: PASSWORD } });
  check('database unreachable -> 503 page without internals', r.status === 503 && !/ECONNREFUSED|127\.0\.0\.1|at .*\.mjs|Error:/.test(r.text), `${r.status}`);
  down.stop();
}

await stack.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
