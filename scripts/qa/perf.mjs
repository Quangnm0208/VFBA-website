#!/usr/bin/env node
/**
 * Core Web Vitals lab measurement (LCP, CLS) in real Chromium under a fixed, reproducible profile.
 *   QA_ARIAL_SHIM=liberation node scripts/qa/serve.mjs 4331 &        # realistic Arial fallback, see serve.mjs
 *   node scripts/qa/perf.mjs http://localhost:4331 [--runs 3] [--profile slow4g|fast] [--pages home,news,article]
 *
 * Profile "slow4g" (default) mirrors Lighthouse's mobile preset: 412x823 viewport at DPR 1.75 (Moto G Power class),
 * 150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up, CPU 4x slowdown. `--device pixel5` uses a denser screen (DPR 2.75). Each page is measured cold (empty cache) and warm (second load in the same
 * browser context). CLS follows Chrome's definition (largest session window, 1 s gap, 5 s cap, input-excluded) and
 * is reported for the load window (until 3 s after `load`) and for the full session including a scroll to the end.
 * For every shift the script prints the shifting elements and their previous/current rectangles, so a result above
 * target comes with the exact element and cause. Results are lab data, not field data.
 */
import { chromium, devices } from 'playwright';

const argv = process.argv.slice(2);
const base = (argv.find((a) => a.startsWith('http')) || 'http://localhost:4321').replace(/\/$/, '');
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const runs = Number(opt('runs', 3));
const profile = opt('profile', 'slow4g');
const PAGES = { home: '/', news: '/tin-tuc/', article: '/tin-tuc/dong-luc-tuong-lai/' };
const pages = opt('pages', 'home,news,article').split(',');

const observe = () => {
  const describe = (n) => {
    if (!n) return 'removed-node';
    const el = n.nodeType === 1 ? n : n.parentElement;
    if (!el) return 'text';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${text ? ` "${text}"` : ''}`;
  };
  const rect = (r) => (r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null);
  window.__v = { shifts: [], lcp: null, fcp: null, loadAt: null };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__v.shifts.push({ t: Math.round(e.startTime), value: e.value, sources: e.sources.map((s) => ({ node: describe(s.node), prev: rect(s.previousRect), cur: rect(s.currentRect) })) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    const last = list.getEntries().at(-1);
    window.__v.lcp = { t: Math.round(last.startTime), el: describe(last.element), size: last.size, url: (last.url || '').split('/').pop() };
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__v.fcp = Math.round(e.startTime);
  }).observe({ type: 'paint', buffered: true });
  addEventListener('load', () => { window.__v.loadAt = Math.round(performance.now()); });
};

/** Chrome's CLS: the worst "session window" (shifts < 1 s apart, window <= 5 s). */
function cls(shifts) {
  let best = 0, sum = 0, first = 0, prev = 0;
  for (const s of [...shifts].sort((a, b) => a.t - b.t)) {
    if (!sum || s.t - prev > 1000 || s.t - first > 5000) { sum = 0; first = s.t; }
    sum += s.value; prev = s.t; best = Math.max(best, sum);
  }
  return +best.toFixed(4);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const device = opt('device', 'lighthouse') === 'pixel5'
  ? devices['Pixel 5']
  : { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' };

async function newCtx() {
  const context = await browser.newContext({ ...device, ignoreHTTPSErrors: true, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await context.addInitScript(() => { try { localStorage.setItem('vbfa:popup:demo-welcome', JSON.stringify({ rev: 'demo-1', at: Date.now() })); } catch {} });
  await context.addInitScript(observe);
  return context;
}

async function throttle(page) {
  if (profile !== 'slow4g') return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function load(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const afterLoad = await page.evaluate(() => JSON.parse(JSON.stringify(window.__v)));
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 350) { await page.evaluate((v) => scrollTo({ top: v, behavior: 'instant' }), y); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  const full = await page.evaluate(() => JSON.parse(JSON.stringify(window.__v)));
  const kb = await page.evaluate(() => Math.round([...performance.getEntriesByType('resource'), ...performance.getEntriesByType('navigation')].reduce((a, e) => a + (e.transferSize || 0), 0) / 1024));
  return { afterLoad, full, kb };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const summary = [];
for (const name of pages) {
  for (const state of ['cold', 'warm']) {
    const rows = [];
    for (let i = 0; i < runs; i++) {
      const context = await newCtx();
      const page = await context.newPage();
      await throttle(page);
      if (state === 'warm') { await page.goto(base + PAGES[name], { waitUntil: 'load', timeout: 120000 }); await page.waitForTimeout(1500); }
      const r = await load(page, base + PAGES[name]);
      rows.push({ lcp: r.afterLoad.lcp?.t ?? null, lcpEl: r.afterLoad.lcp?.el, lcpUrl: r.afterLoad.lcp?.url, fcp: r.afterLoad.fcp, clsLoad: cls(r.afterLoad.shifts), clsFull: cls(r.full.shifts), shifts: r.full.shifts, kb: r.kb });
      await context.close();
    }
    const worst = rows.reduce((a, b) => (b.clsFull > a.clsFull ? b : a));
    const line = { page: name, cache: state, runs, lcpMedian: median(rows.map((r) => r.lcp ?? 0)), lcpMax: Math.max(...rows.map((r) => r.lcp ?? 0)), fcpMedian: median(rows.map((r) => r.fcp ?? 0)), clsLoadMax: Math.max(...rows.map((r) => r.clsLoad)), clsFullMax: Math.max(...rows.map((r) => r.clsFull)), transferKB: median(rows.map((r) => r.kb)), lcpElement: `${rows[0].lcpEl} ${rows[0].lcpUrl || ''}`.trim() };
    summary.push(line);
    console.log(`${name.padEnd(8)} ${state.padEnd(5)} LCP median ${String(line.lcpMedian).padStart(5)}ms (max ${line.lcpMax})  FCP ${line.fcpMedian}ms  CLS load ${line.clsLoadMax}  full ${line.clsFullMax}  ${line.transferKB}KB  LCP: ${line.lcpElement}`);
    if (worst.shifts.length) {
      for (const s of worst.shifts.filter((x) => x.value >= 0.005).slice(0, 4)) {
        console.log(`         shift ${s.value.toFixed(4)} @${s.t}ms: ${s.sources.map((x) => `${x.node} ${JSON.stringify(x.prev)}->${JSON.stringify(x.cur)}`).join(' | ').slice(0, 330)}`);
      }
    }
  }
}
await browser.close();
const bad = summary.filter((s) => s.lcpMax > 2500 || s.clsFullMax > 0.1);
console.log(`\nprofile=${profile} runs=${runs} device=${opt('device', 'lighthouse')}. Targets: LCP <= 2500 ms, CLS <= 0.1. ${bad.length ? `${bad.length} measurement(s) above target.` : 'All within target.'}`);
process.exit(process.env.QA_PERF_STRICT && bad.length ? 1 : 0);
