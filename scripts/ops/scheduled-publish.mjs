#!/usr/bin/env node
/**
 * Scheduled-publish check for a STATIC site.
 *
 * Articles are rendered at build time and only when `publishedAt <= now()`. An article published in Sanity with a future
 * date is therefore left out of the build that the webhook triggers, and nothing rebuilds the site when that date arrives.
 * This script closes the gap: it asks Sanity which articles are due now, asks the live site which articles it serves
 * (`/search-index.json`) and, only when some due article is missing, calls the Vercel Deploy Hook once.
 *
 * Read-only towards Sanity (public dataset, published perspective, no token). The only write is the Deploy Hook POST.
 * Nothing is printed except slugs and a job id: never the hook URL.
 *
 * Environment
 *   SITE_BASE_URL                 required  https://host of the deployment to compare (no trailing path)
 *   VERCEL_DEPLOY_HOOK_URL        required unless DRY_RUN=1  secret
 *   SANITY_PROJECT_ID             default iqyx5ttc
 *   SANITY_DATASET                default production
 *   SANITY_API_VERSION            default 2026-10-01
 *   VERCEL_PROTECTION_BYPASS      optional  Vercel Protection Bypass for Automation (only for a protected Preview)
 *   DRY_RUN=1                     report only, never call the hook
 */

const ARTICLE_PATH = /^\/tin-tuc\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/;
const DUE_QUERY = '*[_type == "article" && defined(slug.current) && publishedAt <= now()].slug.current';

/** Slugs of the articles a deployed `search-index.json` lists. */
export function slugsFromSearchIndex(index) {
  const rows = Array.isArray(index?.articles) ? index.articles : [];
  return rows.map((row) => ARTICLE_PATH.exec(String(row?.[1] ?? ''))?.[1]).filter(Boolean);
}

/** Due articles the live site does not serve yet, sorted. */
export function missingSlugs(dueSlugs, liveSlugs) {
  const live = new Set(liveSlugs);
  return [...new Set(dueSlugs)].filter((slug) => !live.has(slug)).sort();
}

async function getJson(fetchImpl, url, init, what) {
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new Error(`${what}: response is not JSON`);
  }
}

export async function run({ env = process.env, fetchImpl = fetch, log = console.log } = {}) {
  const siteBase = (env.SITE_BASE_URL ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(siteBase)) throw new Error('SITE_BASE_URL must be an https origin, for example https://example.vercel.app');
  const dryRun = env.DRY_RUN === '1';
  const hook = env.VERCEL_DEPLOY_HOOK_URL ?? '';
  if (!dryRun && !/^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//.test(hook)) {
    throw new Error('VERCEL_DEPLOY_HOOK_URL is missing or is not a Vercel Deploy Hook URL');
  }

  const project = env.SANITY_PROJECT_ID || 'iqyx5ttc';
  const dataset = env.SANITY_DATASET || 'production';
  const version = env.SANITY_API_VERSION || '2026-10-01';
  const sanityUrl = `https://${project}.api.sanity.io/v${version}/data/query/${dataset}?perspective=published&query=${encodeURIComponent(DUE_QUERY)}`;
  const due = (await getJson(fetchImpl, sanityUrl, {}, 'Sanity query')).result;
  if (!Array.isArray(due)) throw new Error('Sanity query: unexpected response shape');

  const headers = env.VERCEL_PROTECTION_BYPASS ? { 'x-vercel-protection-bypass': env.VERCEL_PROTECTION_BYPASS } : {};
  const live = slugsFromSearchIndex(await getJson(fetchImpl, `${siteBase}/search-index.json`, { headers }, 'Live site search index'));

  const missing = missingSlugs(due, live);
  log(`due in Sanity: ${new Set(due).size}, served by the site: ${live.length}, due but not served: ${missing.length}`);
  if (!missing.length) return { triggered: false, missing };

  log(`due but not served: ${missing.join(', ')}`);
  if (dryRun) {
    log('DRY_RUN=1: Deploy Hook not called');
    return { triggered: false, missing };
  }
  const res = await fetchImpl(hook, { method: 'POST' });
  if (!res.ok) throw new Error(`Deploy Hook: HTTP ${res.status}`);
  const job = (await res.json().catch(() => ({})))?.job?.id;
  log(`Deploy Hook called${job ? `, job ${job}` : ''}`);
  return { triggered: true, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
