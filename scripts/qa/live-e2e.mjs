#!/usr/bin/env node
/**
 * LIVE end-to-end of /api/join/ and /api/newsletter/ on a DEPLOYED site that is wired to the real services
 * (Vercel Function -> Supabase, Cloudflare Turnstile). No dependencies, Node 22+.
 *
 *   LIVE_E2E_BASE_URL=https://<preview-host> LIVE_E2E_CONFIRM=write-test-rows \
 *   VERCEL_PROTECTION_BYPASS=<automation bypass secret, only if the preview is protected> \
 *   node scripts/qa/live-e2e.mjs
 *
 * It WRITES three test rows (one membership, two newsletter) with controlled identities of the form
 * e2e-<scenario>-<run>@example.invalid (".invalid" can never receive mail) and burns part of the per-address rate-limit
 * budget of the machine it runs from. Run it only against a Preview that uses a Turnstile TEST secret
 * (Cloudflare's published always-pass key 1x0000000000000000000000000000000AA) and LEADS_ENABLED=true.
 *
 * It sees HTTP only. It cannot prove a row exists: afterwards run the verification SQL it prints (Supabase SQL editor or
 * MCP), then the cleanup SQL. Combine both outputs in the evidence; neither alone proves the end-to-end.
 *
 * Safety: refuses to run without LIVE_E2E_CONFIRM=write-test-rows; refuses the production alias unless
 * LIVE_E2E_ALLOW_PRODUCTION=yes (production must keep LEADS_ENABLED=false until the GO decision); refuses plain http
 * except for localhost. Secrets are sent as a header only and never printed.
 *
 * Other environment: LIVE_E2E_ORIGIN (default: the base origin), LIVE_E2E_TURNSTILE_TOKEN (default: the dummy token the
 * Cloudflare test secret accepts), LIVE_E2E_PRODUCTION_HOSTS (comma list, extends the built-in production alias).
 */
const base = (process.env.LIVE_E2E_BASE_URL ?? process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Set LIVE_E2E_BASE_URL (for example https://<preview>.vercel.app).');
  process.exit(2);
}
const url = new URL(base);
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
if (url.protocol === 'http:' && !isLocal) {
  console.error('Refusing plain http for a non-local host.');
  process.exit(2);
}
if (process.env.LIVE_E2E_CONFIRM !== 'write-test-rows') {
  console.error('This script writes test rows to the database behind the site. Re-run with LIVE_E2E_CONFIRM=write-test-rows to confirm.');
  process.exit(2);
}
const productionHosts = ['vfba-website-alpha.vercel.app', ...(process.env.LIVE_E2E_PRODUCTION_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean)];
if (productionHosts.includes(url.hostname) && process.env.LIVE_E2E_ALLOW_PRODUCTION !== 'yes') {
  console.error(`Refusing ${url.hostname}: it is a production host. Production keeps LEADS_ENABLED=false until the GO decision. Set LIVE_E2E_ALLOW_PRODUCTION=yes only after that decision.`);
  process.exit(2);
}

const origin = process.env.LIVE_E2E_ORIGIN ?? url.origin;
const token = process.env.LIVE_E2E_TURNSTILE_TOKEN ?? 'XXXX.DUMMY.TOKEN.XXXX';
const bypass = process.env.VERCEL_PROTECTION_BYPASS;
const run = Date.now().toString(36);
const email = (scenario) => `e2e-${scenario}-${run}@example.invalid`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};

async function call(path, { method = 'POST', body, raw, type = 'application/json', from = origin } = {}) {
  const headers = { 'user-agent': 'vbfa-live-e2e/1.0', ...(from ? { origin: from } : {}), ...(type ? { 'content-type': type } : {}), ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) };
  const response = await fetch(base + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: 'manual' });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, text, json };
}

const member = (over = {}) => ({ kind: 'membership', name: 'E2E Kiểm thử', company: 'VBFA E2E', email: email('member'), phone: '', interest: 'Quan tâm hội viên', message: 'Bản ghi thử nghiệm tự động, có thể xoá.', consent: true, consentVersion: 'join-v2', turnstileToken: token, sourcePath: '/', openedAt: Date.now() - 30_000, website: '', utm: {}, ...over });
const news = (over = {}) => ({ kind: 'newsletter', email: email('news'), consent: true, consentVersion: 'newsletter-v1', turnstileToken: token, sourcePath: '/tin-tuc/', openedAt: Date.now() - 30_000, website: '', utm: {}, ...over });

console.log(`Live E2E against ${url.origin} (run ${run}, origin header ${origin})\n`);

/* 1. Request shape: nothing below stores anything and none of it counts against the throttle */
for (const route of ['/api/join/', '/api/newsletter/']) {
  const get = await call(route, { method: 'GET', type: null });
  check(`${route} GET -> 405 with Allow: POST, no-store`, get.status === 405 && /POST/.test(get.headers.get('allow') ?? '') && /no-store/.test(get.headers.get('cache-control') ?? ''), `${get.status}`);
  check(`${route} foreign Origin -> 403`, (await call(route, { body: {}, from: 'https://evil.example' })).status === 403);
  check(`${route} missing Origin -> 403`, (await call(route, { body: {}, from: null })).status === 403);
  check(`${route} text/plain -> 415`, (await call(route, { raw: 'a=b', type: 'text/plain' })).status === 415);
  check(`${route} body over 8 KB -> 413`, (await call(route, { body: { pad: 'x'.repeat(9000) } })).status === 413);
  check(`${route} malformed JSON -> 400`, (await call(route, { raw: '{not json' })).status === 400);
}

/* 2. Bots: answered "ok", never stored (the printed SQL proves it) */
check('join: honeypot filled -> 200 and silently dropped', (await call('/api/join/', { body: member({ email: email('honeypot'), website: 'http://spam.example' }) })).status === 200);
check('join: submitted faster than a person can type -> 200 and silently dropped', (await call('/api/join/', { body: member({ email: email('toofast'), openedAt: Date.now() }) })).status === 200);

/* 3. Validation and consent: 400 and never stored */
const badEmail = await call('/api/join/', { body: member({ email: 'not-an-email' }) });
check('join: invalid email -> 400 with a field map', badEmail.status === 400 && badEmail.json?.fields?.email, `${badEmail.status} ${badEmail.text.slice(0, 100)}`);
const noConsent = await call('/api/join/', { body: member({ email: email('noconsent'), consent: false }) });
check('join: no consent -> 400 (consent field)', noConsent.status === 400 && noConsent.json?.fields?.consent, `${noConsent.status}`);
const newsNoConsent = await call('/api/newsletter/', { body: news({ email: email('newsnoconsent'), consent: false }) });
check('newsletter: no explicit opt-in -> 400 (consent field)', newsNoConsent.status === 400 && newsNoConsent.json?.fields?.consent, `${newsNoConsent.status}`);
check('newsletter: unapproved consent version -> 400', (await call('/api/newsletter/', { body: news({ email: email('newsbadversion'), consentVersion: 'unreviewed-v99' }) })).status === 400);

/* 4. Captcha: a missing token is refused (needs the Turnstile secret to be configured on the deployment) */
const noCaptcha = await call('/api/newsletter/', { body: news({ email: email('nocaptcha'), turnstileToken: '' }) });
check('newsletter: missing Turnstile token -> 400 captcha (not stored)', noCaptcha.status === 400 && noCaptcha.json?.code === 'captcha', `${noCaptcha.status} ${noCaptcha.text.slice(0, 100)}`);

/* 5. Happy paths: exactly one membership row and one newsletter row */
const joined = await call('/api/join/', { body: member() });
check('join: valid submission -> 200 { ok: true }', joined.status === 200 && joined.json?.ok === true, `${joined.status} ${joined.text.slice(0, 120)}`);
const subscribed = await call('/api/newsletter/', { body: news() });
check('newsletter: valid opt-in -> 200 { ok: true }', subscribed.status === 200 && subscribed.json?.ok === true, `${subscribed.status} ${subscribed.text.slice(0, 120)}`);
const again = await call('/api/newsletter/', { body: news({ email: email('news').toUpperCase().replace('@EXAMPLE.INVALID', '@example.invalid') }) });
check('newsletter: the same address again (other letter case) -> identical answer, no second row', again.status === 200 && again.text === subscribed.text, `${again.status} ${again.text.slice(0, 80)}`);

/* 6. Rate limit: every validated request counts; the budget is 15 per address per 10 minutes */
let limitedAt = 0;
let unexpected = '';
for (let i = 1; i <= 25 && !limitedAt; i++) {
  const r = await call('/api/newsletter/', { body: news({ email: email('ratelimit') }) });
  if (r.status === 429 && r.json?.code === 'rate_limited') limitedAt = i;
  else if (r.status !== 200) unexpected = `request ${i}: ${r.status} ${r.text.slice(0, 80)}`;
  if (unexpected) break;
}
check('rate limit: repeated validated requests from one address end in 429 rate_limited within 25 requests', limitedAt > 0 && !unexpected, unexpected || 'never limited');
if (limitedAt) {
  const blocked = await call('/api/join/', { body: member({ email: email('afterlimit') }) });
  check('rate limit: the budget is per address, not per form (join is refused too)', blocked.status === 429, `${blocked.status}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed (HTTP only: confirm the database with the SQL below)`);
console.log(`
-- 1) Verify: expect EXACTLY three rows (one membership, two newsletter) and nothing for the other scenarios
select kind, email, consent, consent_text_version, source_path, length(ip_hash) as ip_hash_len, status, created_at
from public.website_leads where email like 'e2e-%-${run}@example.invalid' order by created_at;
-- expected e-mails: ${email('member')} (membership, join-v2), ${email('news')} and ${email('ratelimit')} (newsletter, newsletter-v1; the repeats of each are duplicates, not rows)
-- NOT expected: honeypot, toofast, noconsent, newsnoconsent, newsbadversion, nocaptcha, afterlimit, and the invalid address

-- 2) Clean up the test rows (the throttle counters hold only salted hashes and expire after 2 days)
delete from public.website_leads where email like 'e2e-%-${run}@example.invalid';
-- To reset the rate limit of the machine that ran this script on a TEST project: delete from public.form_attempts where created_at > now() - interval '1 hour';
`);
process.exit(failed.length ? 1 : 0);
