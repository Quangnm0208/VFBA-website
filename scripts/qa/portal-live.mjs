#!/usr/bin/env node
/**
 * Black-box checks of the DEPLOYED Admin Portal (the vbfa-admin Vercel project, protected Preview). Real Vercel, real CDN, and for the
 * identity checks REAL Sanity: the portal's Function asks the project API about the tokens used below.
 *
 *   ADMIN_URL=https://vbfa-admin-git-<branch>-quangnm.vercel.app VERCEL_ADMIN_PROTECTION_BYPASS=<secret> \
 *   SANITY_DEPLOY_TOKEN=<api token> node scripts/qa/portal-live.mjs
 *
 * It cannot sign in as a person (a Sanity session needs a browser login), so the positive path "a staff member opens the Leads tool"
 * is NOT covered here: that is the Owner's acceptance step. Writes nothing. Prints no secret.
 */
const site = (process.env.ADMIN_URL ?? '').replace(/\/$/, '');
const bypass = process.env.VERCEL_ADMIN_PROTECTION_BYPASS;
const robotToken = process.env.SANITY_DEPLOY_TOKEN;
if (!/^https:\/\/vbfa-admin(-[a-z0-9-]+)?-quangnm\.vercel\.app$/.test(site)) {
  console.error('Set ADMIN_URL to the vbfa-admin Preview host (never a production or website host).');
  process.exit(2);
}
if (!bypass) {
  console.error('NOT PROVISIONED: VERCEL_ADMIN_PROTECTION_BYPASS (the vbfa-admin project\'s "Protection Bypass for Automation" secret) is not set.');
  process.exit(3);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};
const get = (path, headers = {}, protectedCall = true) => fetch(site + path, { headers: { ...(protectedCall ? { 'x-vercel-protection-bypass': bypass } : {}), ...headers }, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
const post = (body, headers = {}) => fetch(`${site}/api/portal`, { method: 'POST', headers: { 'x-vercel-protection-bypass': bypass, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
const json = async (response) => {
  const text = await response.text();
  try {
    return { text, body: JSON.parse(text) };
  } catch {
    return { text, body: null };
  }
};

// 0) protected
{
  const r = await get('/', {}, false);
  check('without the bypass secret the Preview is protected (401/403/3xx)', [301, 302, 303, 307, 308, 401, 403].includes(r.status), `HTTP ${r.status}`);
}
// 1) the Studio shell
{
  const r = await get('/');
  const html = await r.text();
  check('the Studio shell answers 200 HTML', r.status === 200 && /text\/html/.test(r.headers.get('content-type') ?? '') && html.includes('<div id="sanity"'), `HTTP ${r.status}`);
  const h = r.headers;
  check('framing denied, nosniff, HSTS, noindex', h.get('x-frame-options') === 'DENY' && h.get('x-content-type-options') === 'nosniff' && /max-age=\d+/.test(h.get('strict-transport-security') ?? '') && /noindex/.test(h.get('x-robots-tag') ?? ''));
  check('the Content-Security-Policy (report-only for now) is served', /default-src 'self'/.test(h.get('content-security-policy-report-only') ?? '') && /frame-ancestors 'none'/.test(h.get('content-security-policy-report-only') ?? ''));
  const deep = await get('/leads');
  check('a deep link (/leads) falls back to the Studio shell', deep.status === 200 && (await deep.text()).includes('<div id="sanity"'));
  check('the shell always revalidates (a new deployment is picked up)', /no-cache/.test(h.get('cache-control') ?? ''), h.get('cache-control') ?? 'none');
  const asset = /(?:src|href)="(\/static\/[^"]+\.js)"/.exec(html)?.[1];
  if (asset) {
    const a = await get(asset);
    check('a hashed bundle is served as immutable', a.status === 200 && /immutable/.test(a.headers.get('cache-control') ?? '') && /javascript/.test(a.headers.get('content-type') ?? ''), `${asset} HTTP ${a.status} ${a.headers.get('cache-control') ?? 'none'}`);
  } else check('a hashed bundle is served as immutable', false, 'no /static/*.js reference found in the shell');
  const unknown = await get('/api/does-not-exist');
  check('an unknown /api path is a 404, not the Studio page', unknown.status === 404 && !(await unknown.text()).includes('<div id="sanity"'), `HTTP ${unknown.status}`);
}
// 2) the function exists and is configured
{
  const r = await get('/api/portal');
  const { body } = await json(r);
  if (r.status === 503 && body?.code === 'not_configured') {
    check('the portal function is configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SANITY_STUDIO_PROJECT_ID)', false, 'answers 503 not_configured: the Vercel project variables are missing');
  } else {
    check('GET /api/portal answers 405 with Allow: POST (function deployed and configured)', r.status === 405 && r.headers.get('allow') === 'POST', `HTTP ${r.status}`);
  }
}
// 3) who is calling: real Sanity answers for the identity cases
{
  const noToken = await post({ op: 'session' });
  check('no credential -> 401', noToken.status === 401 && (await json(noToken)).body?.code === 'unauthorized', `HTTP ${noToken.status}`);

  const invalid = await post({ op: 'session' }, { authorization: 'Bearer skInvalidTokenForTheLiveSmoke0000000000000000' });
  check('a token Sanity does not know -> 401 (asked of the REAL Sanity API)', invalid.status === 401 && (await json(invalid)).body?.code === 'unauthorized', `HTTP ${invalid.status}`);

  if (robotToken) {
    const robot = await post({ op: 'session' }, { authorization: `Bearer ${robotToken}` });
    const { text, body } = await json(robot);
    check('a real API (robot) token is recognised by the REAL Sanity API and refused as not a person -> 403 not_allowed', robot.status === 403 && body?.code === 'not_allowed', `HTTP ${robot.status} ${text.slice(0, 80)}`);
    check('the token is never echoed back', !text.includes(robotToken));
    const robotData = await post({ op: 'leads.list' }, { authorization: `Bearer ${robotToken}` });
    check('the same robot token gets no lead data', robotData.status === 403 && !(await robotData.text()).includes('"rows"'));
  } else check('real robot-token check', false, 'SANITY_DEPLOY_TOKEN not provided');
}
// 4) request hygiene
{
  const foreign = await post({ op: 'session' }, { origin: 'https://evil.example', authorization: 'Bearer skInvalidTokenForTheLiveSmoke0000000000000000' });
  check('a foreign Origin is refused before anything else -> 403', foreign.status === 403);
  const own = await post({ op: 'session' }, { origin: site, authorization: 'Bearer skInvalidTokenForTheLiveSmoke0000000000000000' });
  check('the portal\'s own Origin passes the same-origin check (reaches the identity check -> 401)', own.status === 401, `HTTP ${own.status}`);
  const form = await post('op=session', { 'content-type': 'application/x-www-form-urlencoded', authorization: 'Bearer skInvalidTokenForTheLiveSmoke0000000000000000' });
  check('a form post is refused -> 415', form.status === 415);
  const bad = await post('{not json', { authorization: 'Bearer skInvalidTokenForTheLiveSmoke0000000000000000' });
  check('malformed JSON -> 400 (or 401 when the token is checked first)', [400, 401].includes(bad.status));
  const big = await post({ op: 'session', pad: 'x'.repeat(40_000) }, { authorization: 'Bearer skInvalidTokenForTheLiveSmoke0000000000000000' });
  check('an oversized body -> 413', big.status === 413);
  const r = await post({ op: 'session' });
  check('answers are no-store and set no cookie', /no-store/.test(r.headers.get('cache-control') ?? '') && !r.headers.get('set-cookie'));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
