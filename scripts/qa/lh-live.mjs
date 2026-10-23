#!/usr/bin/env node
/**
 * Lighthouse (mobile + desktop, N runs, median) against a DEPLOYED, protected Preview. Real network, real CDN, real data.
 *
 *   SITE=<preview url> VERCEL_PROTECTION_BYPASS=<secret> node scripts/qa/lh-live.mjs [/ /tin-tuc/ ...]
 *
 * The bypass secret is sent as a header only to the audited origin (Lighthouse --extra-headers) and never printed.
 * Lab data from a shared CI runner: compare against docs/QA.md, do not treat as field data.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';

const site = (process.env.SITE ?? '').replace(/\/$/, '');
const bypass = process.env.VERCEL_PROTECTION_BYPASS;
if (!/^https:\/\/vfba-website-[a-z0-9-]+-quangnm\.vercel\.app$/.test(site) || !bypass) {
  console.error('Set SITE (a VBFA Preview host, never production) and VERCEL_PROTECTION_BYPASS.');
  process.exit(2);
}
const pages = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/tin-tuc/', '/tin-tuc/test/'];
const runs = Number(process.env.LH_RUNS ?? 3);
mkdirSync('qa-artifacts/lighthouse', { recursive: true });
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const lines = ['| Form factor | Page | Perf | A11y | Best practices | SEO | FCP | LCP | CLS | TBT |', '|---|---|---|---|---|---|---|---|---|---|'];
let failed = 0;
for (const formFactor of ['mobile', 'desktop']) {
  for (const path of pages) {
    const results = [];
    for (let i = 0; i < runs; i++) {
      const file = `qa-artifacts/lighthouse/${formFactor}-${path.replace(/\W+/g, '_')}-${i}.json`;
      const args = ['--yes', 'lighthouse@13.5.0', site + path, '--output=json', `--output-path=${file}`, '--quiet', `--form-factor=${formFactor}`, ...(formFactor === 'desktop' ? ['--screenEmulation.disabled', '--preset=desktop'] : []),
        '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage', `--extra-headers=${JSON.stringify({ 'x-vercel-protection-bypass': bypass })}`];
      try { execFileSync('npx', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180_000 }); } catch (error) { console.log(`run failed ${formFactor} ${path}: ${String(error.stderr ?? error.message).slice(0, 200)}`); continue; }
      const j = JSON.parse(readFileSync(file, 'utf8'));
      const failing = ['best-practices', 'seo'].flatMap((c) => j.categories[c].auditRefs.filter((r) => r.weight > 0 && j.audits[r.id].scoreDisplayMode !== 'notApplicable' && (j.audits[r.id].score ?? 0) < 1).map((r) => `${c === 'seo' ? 'seo' : 'bp'}:${r.id}`));
      results.push({ failing, perf: j.categories.performance.score * 100, a11y: j.categories.accessibility.score * 100, bp: j.categories['best-practices'].score * 100, seo: j.categories.seo.score * 100, fcp: j.audits['first-contentful-paint'].numericValue, lcp: j.audits['largest-contentful-paint'].numericValue, cls: j.audits['cumulative-layout-shift'].numericValue, tbt: j.audits['total-blocking-time'].numericValue });
    }
    if (!results.length) { failed++; continue; }
    const m = (k) => median(results.map((r) => r[k]));
    const row = `| ${formFactor} | \`${path}\` | ${Math.round(m('perf'))} | ${Math.round(m('a11y'))} | ${Math.round(m('bp'))} | ${Math.round(m('seo'))} | ${Math.round(m('fcp'))} ms | ${Math.round(m('lcp'))} ms | ${m('cls').toFixed(4)} | ${Math.round(m('tbt'))} ms |`;
    console.log(`${formFactor.padEnd(8)} ${path.padEnd(18)} n=${results.length} ${row}`);
    // Name what costs points (the SEO category is expected to lose is-crawlable on a noindex Preview; anything else is news).
    console.log(`         failing audits: ${[...new Set(results.flatMap((r) => r.failing))].join(', ') || 'none'}`);
    lines.push(row);
    // The Preview is noindex on purpose, so the SEO category is not a gate here; accessibility and best practices are.
    if (m('a11y') < 95 || m('bp') < 90) failed++;
  }
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Lighthouse on the protected Preview (${site}, median of ${runs})\n\n${lines.join('\n')}\n`);
process.exit(failed ? 1 : 0);
