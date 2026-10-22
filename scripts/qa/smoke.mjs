#!/usr/bin/env node
/**
 * Black-box smoke test of a DEPLOYED site (preview or production). No dependencies, Node 22+.
 * It checks what a local simulator cannot prove: the headers Vercel really sends, the redirects it really
 * performs and the behaviour of the real Vercel Function.
 *
 *   SMOKE_BASE_URL=https://example.vercel.app node scripts/qa/smoke.mjs
 *
 * Environment
 *   SMOKE_BASE_URL            required. Origin of the deployment to test.
 *   SMOKE_EXPECT_SHA          optional. Wait (up to SMOKE_WAIT_MIN, default 10) until <meta name="vbfa-build"> matches.
 *   SMOKE_EXPECT_INDEXING     off (default) | on. Whether the site must still block search engines.
 *   SMOKE_API_MODE            skip | configured | unconfigured (default configured).
 *                             unconfigured: the deployment has no Supabase credentials, so a VALID submission must be
 *                             refused with 503 (fail closed). Never use it on a deployment that can store data.
 *                             configured: only requests that are rejected before storage are sent.
 *   VERCEL_PROTECTION_BYPASS  optional. Vercel "Protection Bypass for Automation" secret for protected previews.
 *                             Sent as a header only; never printed.
 *
 * Nothing here can create a row in the database: every request sent in `configured` mode is rejected before storage.
 */
const base = (process.env.SMOKE_BASE_URL ?? process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Set SMOKE_BASE_URL (for example https://vfba-website-alpha.vercel.app).');
  process.exit(2);
}
const expectSha = process.env.SMOKE_EXPECT_SHA?.slice(0, 7);
const waitMs = Number(process.env.SMOKE_WAIT_MIN ?? 10) * 60_000;
const indexing = (process.env.SMOKE_EXPECT_INDEXING ?? 'off') === 'on';
const apiMode = process.env.SMOKE_API_MODE ?? 'configured';
const bypass = process.env.VERCEL_PROTECTION_BYPASS;
const origin = new URL(base).origin;

const results = [];
const check = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const skip = (name, reason) => {
  results.push({ name, skipped: true });
  console.log(`SKIP  ${name} (${reason})`);
};
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function get(path, init = {}) {
  const headers = { 'user-agent': 'vbfa-smoke/1.0', ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}), ...(init.headers ?? {}) };
  const response = await fetch(base + path, { redirect: 'manual', ...init, headers });
  const body = init.method === 'HEAD' ? '' : await response.text();
  return { status: response.status, headers: response.headers, body };
}

const SECURITY_HEADERS = {
  'x-content-type-options': /nosniff/i,
  'referrer-policy': /strict-origin-when-cross-origin/i,
  'permissions-policy': /camera=\(\)/i,
  'x-frame-options': /SAMEORIGIN/i,
  'strict-transport-security': /max-age=\d{7,}/i,
};
function assertHeaders(res, label) {
  const csp = res.headers.get('content-security-policy');
  must(csp, `${label}: no Content-Security-Policy header`);
  for (const needle of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'self'", "base-uri 'self'"]) {
    must(csp.includes(needle), `${label}: CSP lacks ${needle}`);
  }
  must(!/unsafe-(inline|eval)/.test(csp), `${label}: CSP allows unsafe-inline/eval`);
  for (const [name, pattern] of Object.entries(SECURITY_HEADERS)) {
    const value = res.headers.get(name);
    must(value && pattern.test(value), `${label}: header ${name} is ${value ?? 'missing'}`);
  }
}
const robotsMeta = (html) => /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? '';

// Wait for the expected build to be live (production redeploys after a push).
if (expectSha) {
  const deadline = Date.now() + waitMs;
  let seen = 'none';
  for (;;) {
    try {
      const res = await get('/');
      seen = /<meta name="vbfa-build" content="([^"]*)"/.exec(res.body)?.[1] ?? `HTTP ${res.status}`;
      if (seen === expectSha) break;
    } catch (error) {
      seen = error.message;
    }
    if (Date.now() > deadline) {
      console.error(`FAIL  deployment does not serve build ${expectSha} (last seen: ${seen})`);
      process.exit(1);
    }
    console.log(`waiting for build ${expectSha}, serving ${seen} ...`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  console.log(`PASS  deployment serves build ${expectSha}`);
}

await check('home: 200 HTML with CSP + security headers + build marker', async () => {
  const res = await get('/');
  must(res.status === 200, `HTTP ${res.status}`);
  must(/text\/html/.test(res.headers.get('content-type') ?? ''), 'not HTML');
  assertHeaders(res, 'home');
  must(/<meta name="vbfa-build" content="[^"]+"/.test(res.body), 'no build marker');
});

await check('news listing /tin-tuc/ (trailing slash): 200 with CSP', async () => {
  const res = await get('/tin-tuc/');
  must(res.status === 200, `HTTP ${res.status}`);
  assertHeaders(res, '/tin-tuc/');
});

await check('/tin-tuc (no slash) redirects to /tin-tuc/', async () => {
  const res = await get('/tin-tuc');
  must([301, 308].includes(res.status), `HTTP ${res.status}`);
  must(new URL(res.headers.get('location') ?? '', base).pathname === '/tin-tuc/', `Location ${res.headers.get('location')}`);
});

let articlePath;
await check('search index lists articles', async () => {
  const res = await get('/search-index.json');
  must(res.status === 200, `HTTP ${res.status}`);
  const index = JSON.parse(res.body);
  articlePath = (index.articles ?? []).map(([, url]) => url).find((url) => /^\/tin-tuc\/[^/]+\/$/.test(url));
  must(articlePath, 'no /tin-tuc/<slug>/ entry in search-index.json articles');
});

await check('article page: 200 with CSP', async () => {
  must(articlePath, 'no article to test');
  const res = await get(articlePath);
  must(res.status === 200, `${articlePath}: HTTP ${res.status}`);
  assertHeaders(res, articlePath);
  must(/application\/ld\+json/.test(res.body) && /NewsArticle/.test(res.body), 'no NewsArticle JSON-LD');
});

await check('unknown route: HTTP 404 page with CSP and noindex', async () => {
  for (const path of ['/trang-khong-ton-tai/', '/tin-tuc/bai-khong-ton-tai/']) {
    const res = await get(path);
    must(res.status === 404, `${path}: HTTP ${res.status}`);
    assertHeaders(res, `404 ${path}`);
    must(/noindex/.test(robotsMeta(res.body)), `${path}: 404 page is indexable`);
    must(/Không tìm thấy trang/.test(res.body), `${path}: not the branded 404 page`);
  }
});

await check(`robots.txt and meta robots match indexing=${indexing ? 'on' : 'off'}`, async () => {
  const robots = await get('/robots.txt');
  must(robots.status === 200, `robots.txt HTTP ${robots.status}`);
  const home = await get('/');
  if (indexing) {
    must(/Sitemap:/i.test(robots.body) && !/Disallow:\s*\/\s*$/m.test(robots.body), 'robots.txt still blocks crawlers');
    must(!/noindex/.test(robotsMeta(home.body)), 'home is still noindex');
  } else {
    must(/Disallow:\s*\/\s*$/m.test(robots.body), 'robots.txt does not block crawlers');
    must(/noindex/.test(robotsMeta(home.body)), 'home is indexable');
  }
});

await check('http:// is redirected to https:// (or refused)', async () => {
  if (!base.startsWith('https://')) throw new Error('base URL is not https');
  const res = await fetch(base.replace('https://', 'http://') + '/', { redirect: 'manual', headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {} });
  must([301, 307, 308].includes(res.status), `HTTP ${res.status}`);
  must((res.headers.get('location') ?? '').startsWith('https://'), `Location ${res.headers.get('location')}`);
});

if (apiMode === 'skip') {
  skip('API behaviour', 'SMOKE_API_MODE=skip');
} else {
  const post = (path, body, headers = {}) =>
    get(path, { method: 'POST', body, headers: { origin, 'content-type': 'application/json', ...headers } });
  for (const route of ['/api/join/', '/api/newsletter/']) {
    await check(`${route} rejects GET with 405, Allow: POST, no-store JSON`, async () => {
      const res = await get(route);
      must(res.status === 405, `HTTP ${res.status}`);
      must(/POST/.test(res.headers.get('allow') ?? ''), 'no Allow: POST');
      must(/no-store/.test(res.headers.get('cache-control') ?? ''), 'response is cacheable');
      must(JSON.parse(res.body).ok === false, 'not the JSON error shape');
    });
    await check(`${route} rejects wrong content type (415), bad JSON (400), foreign origin (403), missing origin (403), oversize (413)`, async () => {
      must((await post(route, 'a=b', { 'content-type': 'text/plain' })).status === 415, 'text/plain not 415');
      must((await post(route, '{not json')).status === 400, 'bad JSON not 400');
      must((await post(route, '{}', { origin: 'https://evil.example' })).status === 403, 'foreign origin not 403');
      must((await get(route, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status === 403, 'missing origin not 403');
      must((await post(route, JSON.stringify({ pad: 'x'.repeat(9000) }))).status === 413, 'oversize not 413');
    });
    await check(`${route} validation failures answer 400 with Vietnamese field errors`, async () => {
      const bad = route.includes('join')
        ? { kind: 'membership', name: 'Smoke Test', company: 'Smoke', email: 'not-an-email', consent: true }
        : { kind: 'newsletter', email: 'not-an-email' };
      const res = await post(route, JSON.stringify(bad));
      must(res.status === 400, `HTTP ${res.status}`);
      const payload = JSON.parse(res.body);
      must(payload.code === 'invalid' && payload.fields?.email, `unexpected body ${res.body.slice(0, 120)}`);
    });
  }
  await check('membership without consent is refused (400)', async () => {
    const res = await post('/api/join/', JSON.stringify({ kind: 'membership', name: 'Smoke Test', company: 'Smoke', email: 'smoke@example.invalid', consent: false }));
    must(res.status === 400 && JSON.parse(res.body).fields?.consent, `HTTP ${res.status} ${res.body.slice(0, 120)}`);
  });
  if (apiMode === 'unconfigured') {
    await check('valid submission fails closed with 503 when credentials are absent', async () => {
      const res = await post('/api/newsletter/', JSON.stringify({ kind: 'newsletter', email: 'smoke@example.invalid', openedAt: Date.now() - 60_000 }));
      must(res.status === 503, `HTTP ${res.status} ${res.body.slice(0, 120)}`);
      must(JSON.parse(res.body).code === 'unavailable', 'not the unavailable code');
    });
  } else {
    skip('valid submission', 'would write to the live database; covered by the database E2E checklist in docs/OPERATIONS.md');
  }
}

const failed = results.filter((r) => r.ok === false);
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} passed, ${failed.length} failed, ${results.filter((r) => r.skipped).length} skipped against ${origin}`);
process.exit(failed.length ? 1 : 0);
