#!/usr/bin/env node
/**
 * Black-box probe of the platform's rate limiting in front of the protected Preview (Vercel Firewall / WAF), measured from outside.
 *
 *   SITE=https://<preview host> VERCEL_PROTECTION_BYPASS=<secret> node scripts/qa/ratelimit-probe.mjs
 *
 * Why: the audit of the real Preview started to receive HTTP 429 with `x-vercel-mitigated: deny` after bursts from one address, on static pages
 * and assets too, while the deployment connector cannot read the firewall configuration (404). This script answers, with numbers: is there a
 * limit, at what rate, for which paths, how long does the block last. It only sends cheap GET requests to the audited origin (its own protected
 * Preview), at a bounded rate, and stops at the first 429. It prints no secret.
 *
 * It does not test anything on a third-party host and is not a load test: at most ~600 requests in total.
 */
const site = (process.env.SITE ?? '').replace(/\/$/, '');
const bypass = process.env.VERCEL_PROTECTION_BYPASS;
if (!/^https:\/\/vfba-website(-[a-z0-9-]+)?-quangnm\.vercel\.app$/.test(site) && !/^https:\/\/vbfa-admin(-[a-z0-9-]+)?-quangnm\.vercel\.app$/.test(site)) {
  console.error('Set SITE to a vfba-website or vbfa-admin Preview host of this team.');
  process.exit(2);
}
if (!bypass) {
  console.error('NOT PROVISIONED: VERCEL_PROTECTION_BYPASS is not set.');
  process.exit(3);
}

const PATHS = (process.env.PROBE_PATHS ?? '/api/join/,/tin-tuc/,/admin/login/').split(',');
const RATE_PER_SECOND = Number(process.env.PROBE_RATE ?? 5);
const MAX_REQUESTS = Number(process.env.PROBE_MAX ?? 180);
const COOL_DOWN_S = Number(process.env.PROBE_COOLDOWN ?? 75);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hit = async (path) => {
  const started = Date.now();
  try {
    const r = await fetch(site + path, { headers: { 'x-vercel-protection-bypass': bypass }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    await r.arrayBuffer();
    return { status: r.status, mitigated: r.headers.get('x-vercel-mitigated'), retryAfter: r.headers.get('retry-after'), ms: Date.now() - started };
  } catch (error) {
    return { status: 0, error: error.name, ms: Date.now() - started };
  }
};

let failed = false;
for (const [index, path] of PATHS.entries()) {
  if (index > 0) {
    console.log(`(cool down ${COOL_DOWN_S}s)`);
    await sleep(COOL_DOWN_S * 1000);
  }
  const statuses = new Map();
  let first429 = null;
  const t0 = Date.now();
  for (let i = 1; i <= MAX_REQUESTS; i++) {
    const r = await hit(path);
    statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
    if (r.status === 429) {
      first429 = { n: i, afterMs: Date.now() - t0, mitigated: r.mitigated, retryAfter: r.retryAfter };
      break;
    }
    await sleep(Math.max(0, 1000 / RATE_PER_SECOND - r.ms));
  }
  const summary = [...statuses].map(([s, n]) => `${s}x${n}`).join(' ');
  if (!first429) {
    console.log(`PATH ${path}: no 429 in ${MAX_REQUESTS} requests at ~${RATE_PER_SECOND}/s (${summary}) -> no limit reached at this rate`);
    continue;
  }
  // how long does the block last?
  const blockStart = Date.now();
  let cleared = null;
  while (Date.now() - blockStart < 120_000) {
    await sleep(5000);
    const r = await hit(path);
    if (r.status !== 429) {
      cleared = Math.round((Date.now() - blockStart) / 1000);
      break;
    }
  }
  const perMinute = Math.round((first429.n / (first429.afterMs / 1000)) * 60);
  console.log(`PATH ${path}: 429 on request #${first429.n} after ${Math.round(first429.afterMs / 1000)}s (~${perMinute}/min); x-vercel-mitigated=${first429.mitigated ?? 'none'}; retry-after=${first429.retryAfter ?? 'none'}; block cleared after ${cleared ?? '>120'}s (${summary})`);
  if (cleared === null) failed = true;
}
process.exit(failed ? 1 : 0);
