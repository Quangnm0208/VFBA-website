#!/usr/bin/env node
/**
 * Browser QA against a running static build (e.g. `python3 -m http.server -d .vercel/output/static 8792`).
 *   node scripts/qa/e2e.mjs http://localhost:8792 [--popup]
 * Covers: responsive layout, overlays and focus handling, news filter/search, article tools, the two forms
 * (API mocked), the pop-up flow (--popup, build with PUBLIC_SEED_DEMO_POPUP=true), motion, console/CSP errors.
 */
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:4321').replace(/\/$/, '');
const withPopup = process.argv.includes('--popup');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  if (process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};
const executablePath = process.env.CHROMIUM_PATH || undefined;
const browser = await chromium.launch({ executablePath });

async function newPage(width, height = 900, opts = {}) {
  const { keepPopup, ...contextOpts } = opts;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width <= 834, hasTouch: width <= 1040, reducedMotion: 'no-preference', ...contextOpts });
  // The demo pop-up (build with PUBLIC_SEED_DEMO_POPUP=true) must not interrupt unrelated tests: mark it as already seen.
  if (!keepPopup) await ctx.addInitScript(() => { try { localStorage.setItem('vbfa:popup:demo-welcome', JSON.stringify({ rev: 'demo-1', at: Date.now() })); } catch {} });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  return page;
}
const noErrors = (name, page) => check(`${name}: no console/CSP errors`, page.errors.length === 0, page.errors.join(' | '));

/* ───────── A. Responsive layout ───────── */
for (const width of [320, 390, 720, 721, 834, 1040, 1041, 1440]) {
  const page = await newPage(width);
  for (const [name, path] of [['home', '/'], ['news', '/tin-tuc/'], ['article', '/tin-tuc/dong-luc-tuong-lai/']]) {
    await page.goto(base + path, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => {
      const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const b = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && b.width > 0; };
      return { ox: document.documentElement.scrollWidth - innerWidth, nav: vis('.nav'), burger: vis('.burger'), cta: vis('.header-cta'), utility: vis('.utility') };
    });
    check(`layout ${name}@${width}: no horizontal overflow`, r.ox <= 0, `+${r.ox}px`);
    check(`layout ${name}@${width}: nav/burger/cta/utility breakpoints`, r.nav === width >= 1041 && r.burger === width < 1041 && r.cta === width >= 1041 && r.utility === width >= 721, JSON.stringify(r));
  }
  noErrors(`layout@${width}`, page);
  await page.context().close();
}

/* ───────── B. Overlays ───────── */
{
  const page = await newPage(390);
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.tap('[data-open="menu"]');
  check('drawer opens and locks scroll', await page.evaluate(() => document.body.classList.contains('is-locked') && !!document.querySelector('.drawer')));
  check('burger aria-expanded=true', (await page.getAttribute('[data-open="menu"]', 'aria-expanded')) === 'true');
  await page.keyboard.press('Escape');
  check('Esc closes drawer and unlocks scroll', await page.evaluate(() => !document.body.classList.contains('is-locked')));
  check('focus returns to the opener', await page.evaluate(() => document.activeElement?.matches('[data-open="menu"]')));
  await page.tap('[data-open="search"]');
  await page.fill('#search-input', 'chính sách');
  await page.waitForSelector('.results a');
  check('search finds Vietnamese diacritics', (await page.$$('.results a')).length > 0);
  await page.fill('#search-input', 'zzzz');
  await page.waitForFunction(() => /Không tìm thấy/.test(document.querySelector('.results')?.textContent || ''));
  check('search empty state', true);
  noErrors('overlays', page);
  await page.context().close();
}

/* ───────── C. News list ───────── */
{
  const page = await newPage(1440);
  await page.goto(base + '/tin-tuc/', { waitUntil: 'networkidle' });
  const visible = () => page.$$eval('.news-grid [data-card]', (els) => els.filter((e) => !e.hidden && getComputedStyle(e).display !== 'none').length);
  check('news: initial state is featured + 6 cards (no layout shift on load)', (await visible()) === 6, String(await visible()));
  await page.click('text=Xem thêm bài viết');
  check('news: load more -> 9', (await visible()) === 9);
  await page.click('button.chip:has-text("Chính sách")');
  check('news: filter syncs URL', page.url().includes('chuyen-muc=chinh-sach'), page.url());
  await page.fill('#nq', 'zzzz');
  check('news: empty state', await page.isVisible('#empty'));
  await page.click('#empty >> text=Xóa bộ lọc');
  check('news: clear resets', (await visible()) >= 6 && !page.url().includes('q='));
  await page.goto(base + '/tin-tuc/?chuyen-muc=hoat-dong&q=tọa', { waitUntil: 'networkidle' });
  check('news: deep link restores state', (await visible()) === 1, String(await visible()));
  noErrors('news', page);
  await page.context().close();
}

/* ───────── D. Article ───────── */
{
  const page = await newPage(1440);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await page.goto(base + '/tin-tuc/tong-hop-chinh-sach/', { waitUntil: 'networkidle' });
  await page.click('.toc a >> nth=1');
  await page.waitForTimeout(1200);
  const top = await page.evaluate(() => Math.round(document.querySelectorAll('.prose h2')[1].getBoundingClientRect().top));
  check('article: TOC scrolls H2 below the sticky header (~104px)', top >= 90 && top <= 120, `top=${top}`);
  check('article: TOC moves keyboard focus to the target heading', await page.evaluate(() => document.activeElement === document.querySelectorAll('.prose h2')[1]));
  await page.click('#copy-link');
  await page.waitForSelector('.toast:not([hidden])');
  check('article: copy link shows toast', true);
  check('article: JSON-LD NewsArticle + canonical + og:image', await page.evaluate(() => {
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
    return ld.some((d) => d['@type'] === 'NewsArticle') && !!document.querySelector('link[rel=canonical]') && !!document.querySelector('meta[property="og:image"]');
  }));
  noErrors('article', page);
  await page.context().close();
}

/* ───────── E. Forms (API mocked) ───────── */
{
  const page = await newPage(1440);
  let last;
  const answer = { current: { status: 200, body: { ok: true } } };
  await page.route('**/api/join/', async (route) => {
    last = JSON.parse(route.request().postData() || '{}');
    await new Promise((r) => setTimeout(r, 250));
    await route.fulfill({ status: answer.current.status, contentType: 'application/json', body: JSON.stringify(answer.current.body) });
  });
  await page.route('**/api/newsletter/', async (route) => {
    last = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  // Cloudflare Turnstile is replaced by a stub (no network): it adds the hidden token input like the real widget does.
  let turnstileRequests = 0;
  await page.route('https://challenges.cloudflare.com/**', async (route) => {
    turnstileRequests += 1;
    await route.fulfill({ contentType: 'text/javascript', body: `window.turnstile={render(el,o){const i=document.createElement('input');i.type='hidden';i.name='cf-turnstile-response';i.value='TEST-TOKEN';el.appendChild(i);(window.__tsOpts=window.__tsOpts||[]).push(o);return 'w'+window.__tsOpts.length},reset(id){(window.__tsReset=window.__tsReset||[]).push(id)}};` });
  });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const hasTurnstile = (await page.$('[data-turnstile]')) !== null; // present when the build had PUBLIC_TURNSTILE_SITE_KEY (CI sets Cloudflare's test key)
  if (hasTurnstile) check('turnstile: nothing from challenges.cloudflare.com is requested on page load', turnstileRequests === 0, String(turnstileRequests));
  const fill = async () => {
    await page.fill('#person', 'Nguyễn Văn A'); await page.fill('#company', 'Công ty ABC'); await page.fill('#email', 'a@abc.vn');
    await page.check('.consent input');
  };
  await page.click('.site-header [data-open="join"]');
  await fill();
  if (hasTurnstile) {
    await page.waitForFunction(() => (window.__tsOpts || []).length >= 1);
    check('turnstile: the join widget renders when the dialog opens', await page.evaluate(() => window.__tsOpts[0].sitekey.length > 0 && window.__tsOpts[0].language === 'vi'));
  }
  await page.waitForTimeout(2300);
  const submit = page.locator('#join-form button[type=submit]');
  await submit.click();
  await page.waitForFunction(() => document.querySelector('#join-form button[type=submit]')?.hasAttribute('aria-busy') || !document.querySelector('.toast')?.hidden);
  check('join: submit button was busy while sending', true);
  await page.waitForSelector('.toast:not([hidden])');
  check('join: success closes dialog and shows the CMS success message', (await page.textContent('.toast__msg')).includes('VBFA đã nhận được') && !(await page.isVisible('.dialog.join')));
  check('join: payload shape (kind, consent, empty honeypot, openedAt, no secrets)', last.kind === 'membership' && last.consent === true && last.website === '' && typeof last.openedAt === 'number' && last.sourcePath === '/' && !('password' in last), JSON.stringify(last));
  check('join: form was reset after success', (await page.inputValue('#person')) === '');
  if (hasTurnstile) {
    check('turnstile: the join payload carries the widget token and the widget is reset afterwards', last.turnstileToken === 'TEST-TOKEN' && (await page.evaluate(() => (window.__tsReset || []).length >= 1)), JSON.stringify(last.turnstileToken));
  }
  await page.waitForSelector('.toast', { state: 'hidden', timeout: 6000 });
  answer.current = { status: 400, body: { ok: false, code: 'invalid', message: 'Email không hợp lệ.' } };
  await page.click('.site-header [data-open="join"]'); await fill(); await page.waitForTimeout(2300);
  await submit.click();
  await page.waitForSelector('[data-status]:not([hidden])');
  check('join: server validation message is shown inline and data is kept', (await page.textContent('[data-status]')) === 'Email không hợp lệ.' && (await page.inputValue('#person')) === 'Nguyễn Văn A' && (await page.isVisible('.dialog.join')));
  check('join: status region is an alert for screen readers', (await page.getAttribute('[data-status]', 'role')) === 'alert');
  await page.unroute('**/api/join/');
  await page.route('**/api/join/', (route) => route.abort('failed'));
  await submit.click();
  await page.waitForFunction(() => /Chưa thể gửi/.test(document.querySelector('[data-status]')?.textContent || ''));
  check('join: network failure shows a retry message without losing input', (await page.inputValue('#company')) === 'Công ty ABC');
  await page.keyboard.press('Escape');
  const joinDismissed = await page.isHidden('[data-overlay="join"]');
  check('join: Escape closes modal after a server/network error', joinDismissed);
  if (!joinDismissed) await page.click('.dialog.join [data-close]');
  const requestsBeforeNewsletter = turnstileRequests;
  const widgetsBefore = hasTurnstile ? await page.evaluate(() => (window.__tsOpts || []).length) : 0;
  await page.fill('.newsletter input[type=email]', 'news@abc.vn');
  if (hasTurnstile) {
    await page.waitForFunction((n) => (window.__tsOpts || []).length > n, widgetsBefore);
    check('turnstile: the newsletter widget renders on first interaction and is invisible unless challenged', await page.evaluate(() => window.__tsOpts.at(-1).appearance === 'interaction-only'));
    check('turnstile: the script is requested at most once for both forms', turnstileRequests - requestsBeforeNewsletter === 0 || turnstileRequests === 1, `${turnstileRequests}`);
  }
  await page.check('.newsletter .consent input');
  check('newsletter: separate explicit consent checkbox is present and required', (await page.getAttribute('.newsletter .consent input', 'required')) !== null);
  await page.waitForTimeout(2300);
  await page.click('.newsletter button[type=submit]');
  await page.waitForSelector('.toast:not([hidden])');
  if (hasTurnstile) check('turnstile: the newsletter payload carries the widget token', last.turnstileToken === 'TEST-TOKEN', JSON.stringify(last.turnstileToken));
  check('newsletter: success toast + payload kind', last.kind === 'newsletter' && last.email === 'news@abc.vn' && (await page.textContent('.toast__msg')).includes('đăng ký'), JSON.stringify(last));
  check('forms: no unexpected console/CSP errors', page.errors.every((e) => /Failed to load resource/.test(e)), page.errors.filter((e) => !/Failed to load resource/.test(e)).join(' | '));
  await page.context().close();
}

/* ───────── F. Pop-up (needs the demo seed popup) ───────── */
if (withPopup) {
  const page = await newPage(1440, 900, { keepPopup: true });
  await page.goto(base + '/tin-tuc/', { waitUntil: 'networkidle' });
  check('popup: not shown before its delay', !(await page.isVisible('[data-overlay="popup"]')));
  await page.waitForSelector('[data-overlay="popup"]:not([hidden])', { timeout: 8000 });
  check('popup: shown after the configured delay and traps focus', await page.evaluate(() => document.body.classList.contains('is-locked') && !!document.activeElement?.closest('[data-overlay="popup"]')));
  await page.keyboard.press('Escape');
  check('popup: dismiss with Esc', !(await page.isVisible('[data-overlay="popup"]')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4500);
  check('popup: frequency cap keeps it closed on the next visit', !(await page.isVisible('[data-overlay="popup"]')));
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-overlay="popup"]:not([hidden])', { timeout: 8000 });
  await page.click('[data-popup-cta]');
  check('popup: CTA opens the join form', await page.isVisible('.dialog.join') && !(await page.isVisible('[data-overlay="popup"]')));
  noErrors('popup', page);
  await page.context().close();
}

/* ───────── G. Motion ───────── */
{
  const page = await newPage(1440);
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const total = await page.$$eval('[data-rv]', (e) => e.length);
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(90); }
  await page.waitForTimeout(2600);
  const left = await page.$$eval('[data-rv]:not([data-in])', (e) => e.length);
  check(`motion: every [data-rv] (${total}) reveals on scroll`, left === 0, `${left} left hidden`);
  check('motion: hero background animations pause while off screen', await page.evaluate(() => document.querySelector('[data-hero]').classList.contains('is-offscreen')));
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => !document.querySelector('[data-hero]').classList.contains('is-offscreen'), null, { timeout: 4000 }).catch(() => {});
  check('motion: ...and resume when it returns', await page.evaluate(() => !document.querySelector('[data-hero]').classList.contains('is-offscreen')));
  await page.context().close();
  const rm = await newPage(1440, 900, { reducedMotion: 'reduce' });
  await rm.goto(base + '/', { waitUntil: 'load' }); await rm.waitForTimeout(150);
  check('motion: reduced motion shows everything immediately', await rm.evaluate(() => [...document.querySelectorAll('[data-rv]')].every((e) => e.hasAttribute('data-in')) && +getComputedStyle(document.querySelector('.hero__pts li')).opacity === 1));
  await rm.context().close();
}

/* ───────── H. Accessibility details: home filter, back-to-top ───────── */
{
  const page = await newPage(1440);
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const shown = () => page.$$eval('#nh-grid .ncard', (els) => els.filter((e) => !e.hidden && getComputedStyle(e).display !== 'none').length);
  const total = await page.$$eval('#nh-grid .ncard', (e) => e.length);
  const policy = await page.$$eval('#nh-grid .ncard[data-cat="policy"]', (e) => e.length);
  check('home filter: all cards shown initially', (await shown()) === total, `${await shown()}/${total}`);
  await page.click('#news [data-filter="policy"]');
  check('home filter: non-matching cards are hidden, not only dimmed', (await shown()) === policy, `${await shown()} shown, ${policy} expected`);
  check('home filter: hidden cards leave the tab order and the accessibility tree', await page.$$eval('#nh-grid .ncard:not([data-cat="policy"])', (els) => els.every((e) => e.hidden && e.getAttribute('aria-hidden') === 'true' && [...e.querySelectorAll('a')].every((a) => a.tabIndex === -1))));
  check('home filter: screen readers get the result count (aria-live)', /^\d+ bài viết/.test((await page.textContent('#news-filter-status')) || '') && (await page.getAttribute('#news-filter-status', 'aria-live')) === 'polite');
  await page.click('#news [data-filter="all"]');
  check('home filter: "Tất cả" restores every card and its links', (await shown()) === total && (await page.$$eval('#nh-grid .ncard a', (a) => a.every((x) => x.tabIndex === 0))));

  const topBtn = () => page.evaluate(() => { const b = document.querySelector('.back-top'); return { visibility: getComputedStyle(b).visibility, hidden: b.getAttribute('aria-hidden') }; });
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.back-top')).visibility === 'hidden');
  const atTop = await topBtn();
  check('back-to-top: not focusable at the top of the page', atTop.visibility === 'hidden' && atTop.hidden === 'true', JSON.stringify(atTop));
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check('back-to-top: keyboard focus never lands on the hidden button', await page.evaluate(() => !document.activeElement?.classList.contains('back-top')));
  await page.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' }));
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.back-top')).visibility === 'visible');
  const scrolled = await topBtn();
  check('back-to-top: appears (visible, exposed) after scrolling', scrolled.visibility === 'visible' && scrolled.hidden === 'false', JSON.stringify(scrolled));
  noErrors('a11y details', page);
  await page.context().close();
}

/* ───────── I. Unknown route: real 404 response with CSP ───────── */
{
  const page = await newPage(390);
  const res = await page.goto(base + '/trang-khong-ton-tai/', { waitUntil: 'networkidle' });
  const csp = res.headers()['content-security-policy'] || '';
  check('404: unknown route answers HTTP 404', res.status() === 404, String(res.status()));
  check('404: response carries a strict CSP (no unsafe-inline/eval)', csp.includes("default-src 'self'") && !/unsafe-(inline|eval)/.test(csp), csp.slice(0, 80));
  check('404: branded page, noindex, link back home', (await page.textContent('h1')).includes('Không tìm thấy trang') && /noindex/.test(await page.getAttribute('meta[name=robots]', 'content')) && (await page.isVisible('.notfound__actions a[href="/"]')));
  check('404: no CSP violations or script errors (the document 404 itself is expected)', page.errors.every((e) => /Failed to load resource: the server responded with a status of 404/.test(e)), page.errors.join(' | '));
  const nested = await page.goto(base + '/tin-tuc/bai-khong-ton-tai/', { waitUntil: 'networkidle' });
  check('404: unknown article slug also answers 404 with CSP', nested.status() === 404 && !!nested.headers()['content-security-policy']);
  const noSlash = await page.goto(base + '/tin-tuc', { waitUntil: 'networkidle' });
  check('routing: /tin-tuc redirects to /tin-tuc/ and keeps the CSP', new URL(noSlash.url()).pathname === '/tin-tuc/' && !!noSlash.headers()['content-security-policy']);
  await page.context().close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok || !r.detail ? '' : `  — ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
