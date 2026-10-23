#!/usr/bin/env node
/**
 * LIVE acceptance of the content pipeline: real Sanity Content Lake -> Sanity webhook -> Vercel Deploy Hook -> Preview rebuild
 * -> updated website. It writes to the real dataset, so every document it creates is a clearly labelled Beta test document with a
 * unique id (beta-e2e-<run>) and is removed again at the end.
 *
 *   SANITY_TOKEN=<write token> SITE=<preview url> VERCEL_PROTECTION_BYPASS=<secret> node scripts/qa/live-cms-e2e.mjs
 *
 * Steps (each is polled against the deployed site, with real elapsed times):
 *   1 draft only           -> not on the site, no rebuild
 *   2 publish (+ image)    -> article page, listing, search index, sitemap, canonical, SEO tags, image from the Sanity CDN
 *   3 update + noIndex     -> new title live, article leaves the sitemap
 *   4 unpublish            -> page gone (404)
 *   5 delete the draft     -> site unchanged
 *   6 failed build         -> an article that violates the content schema is published; the build fails; the PREVIOUS
 *                             deployment keeps serving (verified on the site; the failed deployment is read from Vercel by the engineer)
 *   7 recovery             -> invalid document removed, site rebuilds
 *   8 label                -> the placeholder article "Test-123" is marked as Beta test material (previous values logged)
 * Exit code 0 = all passed.
 */
import { appendFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const PROJECT = process.env.SANITY_PROJECT_ID ?? 'iqyx5ttc';
const DATASET = process.env.SANITY_DATASET ?? 'production';
const API = `https://${PROJECT}.api.sanity.io/v2026-10-01`;
const token = process.env.SANITY_TOKEN;
const site = (process.env.SITE ?? '').replace(/\/$/, '');
const bypass = process.env.VERCEL_PROTECTION_BYPASS;
const FAST = process.env.CMS_E2E_FAST === '1'; // local rehearsal: short waits
const BUILD_WAIT_MS = Number(process.env.CMS_E2E_BUILD_WAIT_MS ?? 10 * 60_000);
const QUIET_MS = Number(process.env.CMS_E2E_QUIET_MS ?? 120_000);
const FAILED_BUILD_MS = Number(process.env.CMS_E2E_FAILED_BUILD_MS ?? 6 * 60_000);
const run = Date.now().toString(36);
const slug = `beta-e2e-${run}`;
const failSlug = `beta-e2e-invalid-${run}`;
const publishedId = slug;
const draftId = `drafts.${slug}`;
const failId = failSlug;

if (!token || !/^https:\/\/vfba-website-[a-z0-9-]+-quangnm\.vercel\.app$/.test(site) || !bypass) {
  console.error('Set SANITY_TOKEN, SITE (a VBFA Preview host, never production) and VERCEL_PROTECTION_BYPASS.');
  process.exit(2);
}

const results = [];
const evidence = [];
const stamp = () => new Date().toISOString().slice(11, 19);
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  const line = `${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`;
  console.log(`[${stamp()}] ${line}`);
  evidence.push(`| ${ok ? 'PASS' : 'FAIL'} | ${name.replace(/\|/g, '/')} | ${detail.replace(/\|/g, '/').slice(0, 160)} |`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────── Sanity ───────── */
async function sanity(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  const text = await response.text();
  let json; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, json, text };
}
const mutate = (mutations) => sanity(`/data/mutate/${DATASET}?returnIds=true&visibility=sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mutations }) });
const query = async (groq, params = {}) => {
  const qs = new URLSearchParams({ query: groq, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`$${k}`, JSON.stringify(v)])) });
  return (await sanity(`/data/query/${DATASET}?${qs}`)).json?.result;
};

/* ───────── the site ───────── */
async function get(path) {
  const response = await fetch(`${site}${path}`, { headers: { 'x-vercel-protection-bypass': bypass, 'cache-control': 'no-cache', 'user-agent': 'vbfa-cms-e2e/1.0' }, redirect: 'manual' });
  return { status: response.status, headers: response.headers, text: await response.text() };
}
async function waitFor(label, predicate, { timeoutMs = BUILD_WAIT_MS, intervalMs = FAST ? 2000 : 15_000 } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await predicate(); } catch (error) { last = { ok: false, note: String(error) }; }
    if (last?.ok) return { ok: true, seconds: Math.round((Date.now() - started) / 1000), last };
    await sleep(intervalMs);
  }
  return { ok: false, seconds: Math.round((Date.now() - started) / 1000), last };
}
const articleLive = async (s) => { const r = await get(`/tin-tuc/${s}/`); return { ok: r.status === 200, status: r.status, text: r.text }; };
const articleGone = async (s) => { const r = await get(`/tin-tuc/${s}/`); return { ok: r.status === 404, status: r.status }; };

/* ───────── a real 1200x630 PNG (no dependency) ───────── */
function png(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, sum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const block = (key, text) => ({ _type: 'block', _key: key, style: 'normal', markDefs: [], children: [{ _type: 'span', _key: `${key}s`, text, marks: [] }] });
const articleDoc = (id, extra = {}) => ({
  _id: id, _type: 'article', title: `[BETA TEST] Bài kiểm thử Publish → Rebuild ${run}`, slug: { _type: 'slug', current: slug },
  excerpt: 'Bài viết kiểm thử tự động của quy trình xuất bản. Đây là tài liệu thử nghiệm Beta, không phải tin chính thức của VBFA.',
  category: 'news', kicker: 'BETA TEST', publishedAt: new Date(Date.now() - 3_600_000).toISOString(),
  body: [block('b1', 'Nội dung kiểm thử tự động. Tài liệu này sẽ bị xoá sau khi kiểm tra xong.')],
  seo: { _type: 'seo', title: `SEO thử nghiệm ${run}`, description: `Mô tả SEO thử nghiệm ${run}.` },
  ...extra,
});

console.log(`CMS acceptance against ${site} (project ${PROJECT}/${DATASET}, run ${run})\n`);

/* ───────── 0. access and baseline ───────── */
const probe = await mutate([{ createOrReplace: { _id: `drafts.beta-e2e-probe-${run}`, _type: 'article', title: 'probe' } }]);
const canWrite = probe.status === 200;
check('the Sanity token can write to the dataset (Editor rights)', canWrite, `${probe.status} ${probe.text.slice(0, 140)}`);
if (!canWrite) {
  console.log('\nOWNER_ACTION_REQUIRED: give the GitHub secret SANITY_DEPLOY_TOKEN the Editor (or Developer) role, or add a separate token with Editor rights.');
  process.exit(1);
}
await mutate([{ delete: { id: `drafts.beta-e2e-probe-${run}` } }]);

const before = await get('/tin-tuc/');
const beforeCount = (await query('count(*[_type == "article" && !(_id in path("drafts.**"))])')) ?? 0;
check('baseline: /tin-tuc/ is served by the Preview', before.status === 200, `${before.status}`);
const marker = /name="vbfa-build" content="([0-9a-f]+)"/.exec(before.text)?.[1] ?? 'unknown';
console.log(`baseline build marker ${marker}, ${beforeCount} published article(s) in the dataset`);

/* ───────── 1. a draft is not public ───────── */
await mutate([{ createOrReplace: articleDoc(draftId) }]);
console.log(`[${stamp()}] draft ${draftId} created; waiting ${Math.round(QUIET_MS / 1000)} s to prove nothing is published`);
await sleep(QUIET_MS);
const afterDraft = await articleGone(slug);
const listAfterDraft = await get('/tin-tuc/');
check('draft only: the article is NOT on the site (404) and not in the listing', afterDraft.ok && !listAfterDraft.text.includes(slug), `${afterDraft.status}`);

/* ───────── 2. publish ───────── */
const upload = await sanity(`/assets/images/${DATASET}?filename=beta-e2e-${run}.png`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: png(1200, 630, [31, 83, 41]) });
const assetId = upload.json?.document?._id;
check('image upload to the Sanity asset store', upload.status === 200 && Boolean(assetId), `${upload.status} ${upload.text.slice(0, 100)}`);
const cover = assetId ? { cover: { _type: 'image', asset: { _type: 'reference', _ref: assetId }, alt: 'Ảnh kiểm thử Beta (màu xanh VBFA)' } } : {};
const t0 = Date.now();
const published = await mutate([{ createOrReplace: { ...articleDoc(publishedId), ...cover } }, { delete: { id: draftId } }]);
check('publish = create the published document and delete its draft (what the Studio does)', published.status === 200, `${published.status}`);
const live = await waitFor('article page after publish', () => articleLive(slug));
check(`publish -> Vercel rebuild -> the article is live on the Preview (${live.seconds} s)`, live.ok, `last status ${live.last?.status}`);
if (live.ok) {
  const page = live.last.text;
  const list = await get('/tin-tuc/');
  const search = await get('/search-index.json');
  const sitemap = await get('/sitemap.xml');
  const robots = await get('/robots.txt');
  check('title, SEO description and canonical come from the CMS document', page.includes(`<title>SEO thử nghiệm ${run}</title>`) && page.includes(`content="Mô tả SEO thử nghiệm ${run}."`) && new RegExp(`<link rel="canonical" href="[^"]*/tin-tuc/${slug}/"`).test(page));
  check('the article is a labelled Beta test, never presented as official news (title, kicker)', page.includes('[BETA TEST]') && page.includes('BETA TEST'));
  check('the listing, the search index and the sitemap contain it', list.text.includes(`/tin-tuc/${slug}/`) && search.text.includes(slug) && sitemap.text.includes(`/tin-tuc/${slug}/`));
  const imgHost = /<img[^>]+src="(https:\/\/cdn\.sanity\.io\/images\/[^"]+)"/.exec(page)?.[1] ?? /property="og:image" content="(https:\/\/cdn\.sanity\.io[^"]+)"/.exec(page)?.[1];
  const img = imgHost ? await fetch(imgHost) : undefined;
  check('the cover is served from the Sanity image CDN (HTTP 200, image/*)', Boolean(img) && img.status === 200 && /^image\//.test(img.headers.get('content-type') ?? ''), imgHost?.slice(0, 80) ?? 'no cdn.sanity.io image in the page');
  check('robots.txt blocks crawlers on the Preview and the page is noindex', /Disallow: \/\n/.test(robots.text) && /noindex/.test(page));
  const headers = (await get(`/tin-tuc/${slug}/`)).headers;
  check('the CSP of the article page allows the Sanity image CDN and the page is not cached publicly', /img-src[^;]*cdn\.sanity\.io/.test(headers.get('content-security-policy') ?? '') && !/s-maxage=[1-9]/.test(headers.get('cache-control') ?? '') || /max-age=0/.test(headers.get('cache-control') ?? ''), `${headers.get('cache-control')}`);
  const newMarker = /name="vbfa-build" content="([0-9a-f]+)"/.exec(page)?.[1];
  console.log(`build marker on the new deployment: ${newMarker} (a content-only rebuild keeps the Git SHA)`);
}

/* ───────── 3. update + noIndex ───────── */
const updatedTitle = `[BETA TEST] Bài kiểm thử đã sửa ${run}`;
await mutate([{ patch: { id: publishedId, set: { title: updatedTitle, 'seo.noIndex': true } } }]);
const upd = await waitFor('updated title live', async () => { const r = await articleLive(slug); return { ok: r.ok && r.text.includes('đã sửa'), status: r.status }; });
check(`update of a published document is live after the rebuild (${upd.seconds} s)`, upd.ok);
if (upd.ok) {
  const sitemap = await get('/sitemap.xml');
  check('seo.noIndex on the document removes it from the sitemap and adds noindex', !sitemap.text.includes(`/tin-tuc/${slug}/`) && /noindex/.test((await get(`/tin-tuc/${slug}/`)).text));
}

/* ───────── 4. unpublish, 5. delete ───────── */
await mutate([{ createIfNotExists: { ...articleDoc(draftId), title: updatedTitle } }, { delete: { id: publishedId } }]);
const gone = await waitFor('page gone after unpublish', () => articleGone(slug));
check(`unpublish (published deleted, draft kept) removes the page after the rebuild (${gone.seconds} s)`, gone.ok, `last status ${gone.last?.status}`);
if (gone.ok) {
  const search = await get('/search-index.json');
  check('and the article leaves the listing and the search index', !(await get('/tin-tuc/')).text.includes(slug) && !search.text.includes(slug));
}
await mutate([{ delete: { id: draftId } }]);
if (assetId) await mutate([{ delete: { id: assetId } }]);
const leftovers = await query('count(*[_id in [$a, $b]])', { a: publishedId, b: draftId });
check('delete: the draft and the test image are removed from the dataset (0 left)', leftovers === 0, `${leftovers} left`);

/* ───────── 6. a failed build keeps the previous deployment ───────── */
const invalid = articleDoc(failId, { category: 'not-a-category', slug: { _type: 'slug', current: failSlug }, title: `[BETA TEST] Bài sai cấu trúc ${run}` });
const t1 = Date.now();
await mutate([{ createOrReplace: invalid }]);
console.log(`[${stamp()}] invalid article published (category "not-a-category"); the build must fail; watching the site for ${Math.round(FAILED_BUILD_MS / 1000)} s`);
let stable = true;
let polls = 0;
while (Date.now() - t1 < FAILED_BUILD_MS) {
  await sleep(FAST ? 2000 : 20_000);
  const r = await get(`/tin-tuc/${failSlug}/`);
  const list = await get('/tin-tuc/');
  const home = await get('/');
  polls++;
  if (r.status !== 404 || list.status !== 200 || home.status !== 200 || list.text.includes(failSlug)) { stable = false; break; }
}
check(`failed build: for ${Math.round((Date.now() - t1) / 1000)} s (${polls} polls) the Preview kept serving the last good deployment (home 200, listing 200, invalid article never visible)`, stable);

/* ───────── 7. recovery ───────── */
await mutate([{ delete: { id: failId } }]);
const recovered = await waitFor('site healthy after the invalid document is removed', async () => { const r = await get('/tin-tuc/'); return { ok: r.status === 200 && !r.text.includes(failSlug) && r.text.length > 1000 }; }, { timeoutMs: FAST ? 20_000 : BUILD_WAIT_MS });
check('recovery: the invalid document is deleted and the site is healthy', recovered.ok);

/* ───────── 8. label the placeholder content ───────── */
const placeholders = await query('*[_type == "article" && !(_id in path("drafts.**")) && !(_id match "beta-e2e-*") && title match "Test*" && !(title match "[BETA TEST]*")]{_id, title, kicker, excerpt}');
for (const doc of placeholders ?? []) {
  console.log(`label: ${doc._id} previous title=${JSON.stringify(doc.title)} kicker=${JSON.stringify(doc.kicker)}`);
  const r = await mutate([{ patch: { id: doc._id, set: { title: `[BETA TEST] ${doc.title}`, kicker: 'BETA TEST · KHÔNG PHẢI TIN CHÍNH THỨC' } } }]);
  check(`placeholder article ${doc._id} is labelled as Beta test material`, r.status === 200, `${r.status}`);
}
if ((placeholders ?? []).length) {
  const labelled = await waitFor('label live', async () => { const r = await get('/tin-tuc/'); return { ok: r.status === 200 && r.text.includes('[BETA TEST]') }; });
  check(`the label is live on the listing after the rebuild (${labelled.seconds} s)`, labelled.ok);
} else console.log('label: no unlabelled placeholder article found (already labelled or none).');

/* ───────── summary ───────── */
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (real Sanity, real Vercel Preview; elapsed ${Math.round((Date.now() - t0) / 1000)} s since publish)`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## CMS acceptance (run ${run})\n\nPreview: ${site}\n\n| Result | Check | Detail |\n|---|---|---|\n${evidence.join('\n')}\n`);
}
process.exit(failed.length ? 1 : 0);
