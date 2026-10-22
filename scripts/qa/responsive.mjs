#!/usr/bin/env node
/**
 * Responsive / layout audit in real Chromium at nine widths, with screenshots.
 *   node scripts/qa/responsive.mjs http://localhost:4330
 *
 * Widths: 320 375 390 430 768 834 1024 1440 1920. Pages: home, news, article, 404.
 * Per page it measures (never assumes): horizontal overflow and the elements causing it, broken or distorted
 * images, logo proportions, clipped text, undersized touch targets, keyboard focus visibility, font load errors,
 * console/CSP errors, heading structure. It also opens the drawer, search and join dialogs and checks they fit.
 * Output: <QA_OUT or qa-artifacts/responsive>/report.json and PNG screenshots at representative widths.
 * Exit code 1 when any FAIL is recorded. INFO lines are findings that need a human decision, not failures.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:4321').replace(/\/$/, '');
const outDir = process.env.QA_OUT || 'qa-artifacts/responsive';
const WIDTHS = (process.env.QA_WIDTHS ? process.env.QA_WIDTHS.split(',').map(Number) : [320, 375, 390, 430, 768, 834, 1024, 1440, 1920]);
const SHOTS = new Set([320, 390, 768, 834, 1024, 1440, 1920]);
const ROUTES = [
  ['home', '/'],
  ['news', '/tin-tuc/'],
  ['article', '/tin-tuc/dong-luc-tuong-lai/'],
  ['notfound', '/trang-khong-ton-tai/'],
];
const heightFor = (w) => (w <= 430 ? 800 : w <= 834 ? 1100 : 900);

await mkdir(outDir, { recursive: true });
const findings = [];
const add = (level, ctx, message, detail) => {
  findings.push({ level, ctx, message, ...(detail ? { detail } : {}) });
  if (level !== 'PASS') console.log(`${level.padEnd(4)}  ${ctx}  ${message}${detail ? `  ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function open(width, path) {
  const context = await browser.newContext({
    viewport: { width, height: heightFor(width) },
    isMobile: width <= 834,
    hasTouch: width <= 1040,
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(() => {
    try { localStorage.setItem('vbfa:popup:demo-welcome', JSON.stringify({ rev: 'demo-1', at: Date.now() })); } catch {}
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  const response = await page.goto(base + path, { waitUntil: 'networkidle' });
  return { context, page, response };
}

/** Scroll through the page so reveal-on-scroll content is shown and lazy images are requested. */
async function settle(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((v) => scrollTo({ top: v, behavior: 'instant' }), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
    await Promise.race([Promise.all([...document.images].map((i) => i.decode().catch(() => null))), new Promise((r) => setTimeout(r, 4000))]);
  });
  await page.waitForTimeout(2300); // reveal animations finish (data-done after 2s)
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(250);
}

const measure = () => {
  const vw = innerWidth;
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    if (el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const out = { vw, docOverflow: document.documentElement.scrollWidth - vw };

  // Elements that stick out of the viewport AND are not clipped by an overflow:hidden ancestor.
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'hidden' || ox === 'clip' || ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  out.offenders = [...document.body.querySelectorAll('*')]
    .filter((el) => visible(el) && getComputedStyle(el).position !== 'fixed' && !clipped(el))
    .filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
    .slice(0, 6)
    .map((el) => `${label(el)} [${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}]`);

  out.brokenImages = [...document.images].filter((i) => visible(i) && i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src'));
  out.distorted = [...document.images]
    .filter((i) => visible(i) && i.naturalWidth > 0 && !['cover', 'contain', 'scale-down', 'none'].includes(getComputedStyle(i).objectFit))
    .filter((i) => {
      // Layout size, not getBoundingClientRect(): decorative art is rotated and its bounding box is larger than the image.
      const w = i.offsetWidth, h = i.offsetHeight;
      return h > 0 && Math.abs(w / h - i.naturalWidth / i.naturalHeight) / (i.naturalWidth / i.naturalHeight) > 0.04;
    })
    .slice(0, 5)
    .map((i) => `${i.getAttribute('src')?.split('/').pop()} laid out ${i.offsetWidth}x${i.offsetHeight} natural ${i.naturalWidth}x${i.naturalHeight}`);

  const logo = document.querySelector('.site-header .logo img');
  if (logo) {
    out.logo = { w: logo.offsetWidth, h: logo.offsetHeight, ratioDelta: +(Math.abs(logo.offsetWidth / logo.offsetHeight - logo.naturalWidth / logo.naturalHeight) / (logo.naturalWidth / logo.naturalHeight)).toFixed(3) };
  }

  out.clippedText = [...document.body.querySelectorAll('h1,h2,h3,h4,p,a,button,span,li,label,.badge,.kicker')]
    .filter((el) => visible(el) && el.textContent.trim())
    .filter((el) => { const cs = getComputedStyle(el); return (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1; })
    .slice(0, 6)
    .map((el) => `${label(el)} "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);

  const inline = (el) => !!el.closest('.prose p, .prose li, .about__lead, .dialog__sub, .consent, .footer__brand p, .footer__contact p, .lead, .ncard__p, .card-p');
  const targets = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button]')]
    .filter((el) => visible(el) && !el.closest('.hp') && !inline(el) && !el.matches('.skip-link'));
  const size = (el) => { const r = el.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); };
  out.tinyTargets = targets.filter((el) => size(el) < 24).slice(0, 6).map((el) => `${label(el)} ${size(el)}px "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}"`);
  const small = targets.filter((el) => size(el) >= 24 && size(el) < 44);
  out.smallTargets = small.length;
  out.smallSample = [...new Set(small.map((el) => `${label(el)} ${size(el)}px "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 22)}"`))].slice(0, 8);
  out.targetCount = targets.length;

  out.h1 = document.querySelectorAll('h1').length;
  // Faces named "... fallback: Arial" are src:local(Arial); they legitimately error on machines without Arial.
  out.fontErrors = [...document.fonts].filter((f) => f.status === 'error' && !/ fallback: /.test(f.family)).map((f) => f.family);
  out.arialAvailable = [...document.fonts].some((f) => / fallback: Arial$/.test(f.family) && f.status === 'loaded');
  out.lang = document.documentElement.lang;
  return out;
};

async function focusAudit(page) {
  const problems = [];
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('body').click({ position: { x: 1, y: 1 }, force: true }).catch(() => {});
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      return { name: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(/\s+/)[0] : ''}`, ring, onScreen: r.bottom > 0 && r.top < innerHeight, hiddenFocus: cs.visibility === 'hidden' || +cs.opacity === 0 };
    });
    if (!info) continue;
    if (info.hiddenFocus) problems.push(`focus lands on an invisible element ${info.name}`);
    else if (!info.ring) problems.push(`no visible focus style on ${info.name}`);
  }
  return problems;
}

for (const width of WIDTHS) {
  for (const [name, path] of ROUTES) {
    const ctx = `${name}@${width}`;
    const { context, page, response } = await open(width, path);
    const expected = name === 'notfound' ? 404 : 200;
    if (response.status() !== expected) add('FAIL', ctx, `HTTP ${response.status()} (expected ${expected})`);
    await settle(page);
    const m = await page.evaluate(measure);

    if (m.docOverflow > 0) add('FAIL', ctx, `horizontal overflow +${m.docOverflow}px`, m.offenders);
    if (m.brokenImages.length) add('FAIL', ctx, 'broken images', m.brokenImages);
    if (m.distorted.length) add('FAIL', ctx, 'images rendered at a different aspect ratio than their file (distortion)', m.distorted);
    if (m.logo && m.logo.ratioDelta > 0.03) add('FAIL', ctx, 'logo is distorted', m.logo);
    if (m.clippedText.length) add('FAIL', ctx, 'text is clipped by its container', m.clippedText);
    if (m.tinyTargets.length) add('FAIL', ctx, 'interactive targets smaller than 24px (WCAG 2.5.8)', m.tinyTargets);
    if (m.smallTargets) add('INFO', ctx, `${m.smallTargets}/${m.targetCount} targets are 24-43px (below the 44px recommendation)`, m.smallSample);
    if (m.h1 !== 1) add('FAIL', ctx, `${m.h1} <h1> elements`);
    if (m.fontErrors.length) add('FAIL', ctx, 'web fonts failed to load', m.fontErrors);
    if (m.lang !== 'vi') add('FAIL', ctx, `lang="${m.lang}"`);
    const errors = page.errors.filter((e) => !(name === 'notfound' && /status of 404/.test(e)));
    if (errors.length) add('FAIL', ctx, 'console/CSP errors', errors);
    if (SHOTS.has(width)) await page.screenshot({ path: `${outDir}/${name}-${width}.png`, fullPage: true, animations: 'disabled', timeout: 60000 });
    if (width === 390 || width === 1440) {
      const problems = await focusAudit(page);
      if (problems.length) add('FAIL', ctx, 'keyboard focus', [...new Set(problems)]);
    }
    findings.push({ level: 'PASS', ctx, message: 'measured', detail: { overflow: m.docOverflow, targets: m.targetCount, small: m.smallTargets } });
    await context.close();
  }

  // Overlays: they must fit the viewport and keep their controls reachable.
  const ctx = `overlays@${width}`;
  const { context, page } = await open(width, '/');
  const fits = async (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { missing: true };
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
    }, selector);
  if (width < 1041) {
    await page.click('[data-open="menu"]');
    await page.waitForSelector('.drawer');
    await page.waitForTimeout(500);
    const d = await fits('.drawer');
    if (d.missing || d.left < -1 || d.right > d.vw + 1) add('FAIL', ctx, 'drawer does not fit the viewport', d);
    if (SHOTS.has(width) && [390, 834].includes(width)) await page.screenshot({ path: `${outDir}/overlay-drawer-${width}.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
  await page.click('.site-header [data-open="search"]');
  await page.waitForSelector('.dialog--search');
  await page.waitForTimeout(450);
  const s = await fits('.dialog--search');
  if (s.missing || s.left < -1 || s.right > s.vw + 1) add('FAIL', ctx, 'search dialog does not fit the viewport', s);
  await page.keyboard.press('Escape');
  const openJoin = width >= 1041 ? '.site-header [data-open="join"]' : '.footer [data-open="join"]';
  await page.click(openJoin);
  await page.waitForSelector('.dialog.join');
  await page.waitForTimeout(500);
  const j = await fits('.dialog.join');
  if (j.missing || j.left < -1 || j.right > j.vw + 1) add('FAIL', ctx, 'join dialog is wider than the viewport', j);
  const reach = await page.evaluate(async () => {
    const btn = document.querySelector('#join-form button[type=submit]');
    btn.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 120));
    const r = btn.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth };
  });
  if (reach.top < 0 || reach.bottom > reach.vh || reach.left < 0 || reach.right > reach.vw) add('FAIL', ctx, 'join submit button cannot be brought fully into view', reach);
  if ([390, 834, 1440].includes(width)) await page.screenshot({ path: `${outDir}/overlay-join-${width}.png`, animations: 'disabled' });
  const errs = page.errors;
  if (errs.length) add('FAIL', ctx, 'console/CSP errors', errs);
  await context.close();
}

await browser.close();
const fails = findings.filter((f) => f.level === 'FAIL');
const infos = findings.filter((f) => f.level === 'INFO');
await writeFile(`${outDir}/report.json`, JSON.stringify({ base, widths: WIDTHS, routes: ROUTES.map((r) => r[1]), fails: fails.length, infos: infos.length, findings }, null, 2));
console.log(`\n${WIDTHS.length} widths x ${ROUTES.length} pages + overlays: ${fails.length} FAIL, ${infos.length} INFO. Report: ${outDir}/report.json`);
process.exit(fails.length ? 1 : 0);
