#!/usr/bin/env node
/**
 * Browser QA of the CRM (Chromium) against the compiled Function, the real SQL (PGlite) and an emulated Supabase Auth.
 *
 *   npm run build && node scripts/qa/crm-browser.mjs [--shots]
 *
 * Covers: sign-in and sign-out by keyboard, the Lead Inbox (filters, search, pagination), detail, status workflow, notes, staff
 * management, role gating, cookie flags, cache behaviour after sign-out (Back button), CSP (no console errors), axe-core
 * (WCAG 2.1 A/AA + best practices, incl. colour contrast) on every screen, focus visibility, touch-target size and horizontal
 * overflow at 320 / 375 / 390 / 430 / 768 / 1024 / 1440 / 1920 px.
 *
 * Emulated, and therefore NOT a real-service result: Supabase Auth, Postgres/PostgREST (see crm-stack.mjs). The proxy below
 * serves public/ files like Vercel does and rewrites the Origin header to the origin the host script assigns (a QA-only shim).
 */
import http from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';
import { ENTRY, ORIGIN, PASSWORD, startStack } from './crm-stack.mjs';

if (!existsSync(ENTRY)) {
  console.error('No build output. Run `npm run build` first.');
  process.exit(2);
}
const shots = process.argv.includes('--shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const stack = await startStack();
const { USERS, q } = stack;
const host = await stack.startHost(stack.env());

/* ───────── data: 27 membership leads, 3 newsletter leads, one with markup ───────── */
for (let i = 0; i < 27; i++) {
  await q('insert into public.website_leads (kind, name, company, email, consent, consent_text_version, source_path, status, created_at) values ($1,$2,$3,$4,true,$5,$6,$7,$8)',
    ['membership', `Khách số ${String(i).padStart(2, '0')}`, i % 2 ? 'Công ty Xanh' : 'Hiệp hội Sinh khối', `khach${String(i).padStart(2, '0')}@beta.invalid`, 'join-v2', i % 3 ? '/' : '/tin-tuc/', i % 9 === 0 ? 'contacted' : 'new', new Date(Date.parse('2026-10-01T03:00:00Z') + i * 3_600_000).toISOString()]);
}
for (let i = 0; i < 3; i++) await q("insert into public.website_leads (kind, email, consent, consent_text_version, source_path) values ('newsletter', $1, true, 'newsletter-v1', '/tin-tuc/')", [`ban-tin-${i}@beta.invalid`]);
await q("insert into public.website_leads (kind, name, company, email, message, consent, consent_text_version) values ('membership', $1, $2, 'xss@beta.invalid', $3, true, 'join-v2')", ['<img src=x onerror=alert(1)>', '"><script>alert(2)</script>', '<svg onload=alert(3)>']);

/* ───────── front proxy: public/ files first (like Vercel), then the function ───────── */
const staticRoot = resolve('.vercel/output/static');
const browserOrigins = []; // the Origin header the BROWSER sent on form posts, before the QA shim below rewrites it
const types = { '.css': 'text/css', '.png': 'image/png', '.js': 'text/javascript' };
const proxy = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  const file = normalize(join(staticRoot, pathname));
  if (file.startsWith(staticRoot) && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    return res.end(readFileSync(file));
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!['host', 'connection', 'content-length'].includes(k)) headers[k] = String(v);
  if (req.method === 'POST') browserOrigins.push(String(req.headers.origin));
  if (headers.origin) headers.origin = ORIGIN; // QA shim: the host script serves every request as ORIGIN
  const response = await fetch(`http://127.0.0.1:${host.port}${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' });
  const out = Object.fromEntries([...response.headers].filter(([k]) => k !== 'set-cookie'));
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise((ok) => proxy.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${proxy.address().port}`;

/* ───────── browser helpers ───────── */
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function open(width = 1280, height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width <= 834, hasTouch: width <= 1040, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' });
  const page = await context.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  // A 401/403/429 answer to a navigation is the designed behaviour (the browser still logs it as a failed resource).
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/status of (401|403|429)/.test(m.text())) page.problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on('requestfailed', (r) => page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  return { page, context };
}
const signIn = async (page, who, password = PASSWORD) => {
  await q('delete from public.crm_login_attempts'); // the throttle (8 per e-mail / 10 min) is covered by crm-function.mjs; here it would only get in the way
  await page.goto(`${BASE}/admin/login/`);
  await page.getByLabel('Email').fill(USERS[who].email);
  await page.getByLabel('Mật khẩu').fill(password);
  await Promise.all([page.waitForLoadState('load'), page.getByRole('button', { name: 'Đăng nhập' }).click()]);
};
async function axe(page) {
  await page.evaluate(axeSource); // evaluated through the protocol: the page CSP (no script) does not apply
  const { violations } = await page.evaluate(() => globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
}
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const wideElements = (page) => page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !e.closest('.table-wrap')).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${e.className}:${Math.round(e.getBoundingClientRect().right)}>${document.documentElement.clientWidth}`));

/* ───────── 1. sign-in screen and keyboard ───────── */
{
  const { page, context } = await open();
  const res = await page.goto(`${BASE}/admin/login/`);
  check('login page: 200, Vietnamese, one h1, labelled fields, stylesheet applied (not unstyled)', res.status() === 200 && (await page.locator('html').getAttribute('lang')) === 'vi' && (await page.locator('h1').count()) === 1 && (await page.getByLabel('Email').count()) === 1 && (await page.getByLabel('Mật khẩu').count()) === 1 && (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(244, 246, 236)');
  check('login page: focus starts in the e-mail field; Tab reaches password, then the button; focus ring is visible', await (async () => {
    const active = () => page.evaluate(() => ({ name: document.activeElement?.getAttribute('name') ?? document.activeElement?.textContent?.trim(), outline: getComputedStyle(document.activeElement).outlineStyle, width: parseFloat(getComputedStyle(document.activeElement).outlineWidth) }));
    const first = await active();
    await page.keyboard.press('Tab');
    const second = await active();
    await page.keyboard.press('Tab');
    const third = await active();
    return first.name === 'email' && second.name === 'password' && third.name === 'Đăng nhập' && third.outline !== 'none' && third.width >= 2;
  })());
  const issues = await axe(page);
  check('login page: axe-core WCAG 2.2 AA + best practices -> 0 violations', issues.length === 0, issues.join('; '));
  await page.getByLabel('Email').fill(USERS.staff.email);
  await page.getByLabel('Mật khẩu').fill('wrong-password');
  await page.keyboard.press('Enter');
  await page.waitForLoadState('load');
  const alert = await page.getByRole('alert').textContent();
  check('wrong password by keyboard (Enter): the same page with an announced, generic error; the typed e-mail is kept, the password is not', /Email hoặc mật khẩu không đúng/.test(alert ?? '') && (await page.getByLabel('Email').inputValue()) === USERS.staff.email && (await page.getByLabel('Mật khẩu').inputValue()) === '');
  check('login page: no console error, no failed request (CSP and CSS fine)', page.problems.length === 0, page.problems.join('; '));
  await context.close();
}

/* ───────── 2. staff: inbox, filters, detail, workflow, notes, sign-out ───────── */
{
  const { page, context } = await open();
  page.on('dialog', (d) => d.dismiss());
  await signIn(page, 'staff');
  check('signing in lands on the Lead Inbox with the navigation for staff (no staff-management link)', page.url().endsWith('/admin/leads/') && (await page.getByRole('heading', { level: 1 }).textContent()) === 'Khách quan tâm' && (await page.getByRole('link', { name: 'Người dùng CRM' }).count()) === 0 && (await page.getByRole('link', { name: 'Tài khoản' }).count()) === 1);

  const cookies = await context.cookies();
  const crm = cookies.filter((c) => c.name.startsWith('__Secure-vbfa-'));
  check('three session cookies: HttpOnly, Secure, SameSite=Strict, scoped to /admin; none readable by page script', crm.length === 3 && crm.every((c) => c.httpOnly && c.secure && c.sameSite === 'Strict' && c.path === '/admin') && !(await page.evaluate(() => document.cookie)).includes('vbfa'), JSON.stringify(crm.map((c) => [c.name, c.httpOnly, c.secure, c.sameSite, c.path])));

  const rows = () => page.locator('tbody tr').count();
  check('first page lists 25 of 31 leads, newest first, with a pager', (await rows()) === 25 && /Hiển thị 1–25 trong 31 kết quả/.test(await page.locator('main').textContent()) && /Trang 1 \/ 2/.test(await page.locator('.pager').textContent()));
  await page.getByRole('link', { name: /Trang sau/ }).click();
  check('next page shows the remaining 6 and keeps the page number in the URL', (await rows()) === 6 && page.url().includes('page=2') && (await page.getByText('Trang trước').count()) > 0);
  await page.goto(`${BASE}/admin/leads/`);

  await page.getByLabel('Trạng thái').selectOption('contacted');
  await Promise.all([page.waitForLoadState('load'), page.getByRole('button', { name: 'Lọc' }).click()]);
  check('filter by status "Đang xử lý" (form, no script) keeps only those rows', (await rows()) === 3 && (await page.locator('tbody .badge').allTextContents()).every((t) => t === 'Đang xử lý') && page.url().includes('status=contacted'));
  await page.getByRole('link', { name: 'Xoá bộ lọc' }).click();
  await page.getByLabel('Loại').selectOption('newsletter');
  await page.getByLabel('Tìm kiếm').fill('ban-tin-1');
  await Promise.all([page.waitForLoadState('load'), page.getByLabel('Tìm kiếm').press('Enter')]);
  check('kind + search together narrow to one newsletter lead', (await rows()) === 1 && /ban-tin-1@beta\.invalid/.test(await page.locator('tbody').textContent()));
  await page.goto(`${BASE}/admin/leads/?from=2026-10-01&to=2026-10-01`);
  check('date filter (Vietnam calendar day) returns only that day', (await rows()) >= 1 && (await page.locator('tbody tr td:first-child').allTextContents()).every((t) => t.includes('/10/2026') && /01\/10\/2026$/.test(t.trim())));

  await page.goto(`${BASE}/admin/leads/?q=xss@beta`);
  const dangerous = await page.locator('tbody').innerHTML();
  check('XSS: markup in a lead is inert text in the list (no element created, no dialog, no console error)', !/<img |<script|<svg/.test(dangerous) && (await page.locator('tbody img, tbody script, tbody svg').count()) === 0 && page.problems.length === 0, page.problems.join('; '));

  await page.goto(`${BASE}/admin/leads/?q=khach07`);
  await page.getByRole('link', { name: /Xem/ }).click();
  check('lead detail: name in the heading, consent version, consent time, source page, "Nhận lúc"', /Khách số 07/.test(await page.locator('h1').textContent()) && (await page.locator('main').textContent()).includes('join-v2') && /Thời điểm đồng ý/.test(await page.locator('main').textContent()) && /Trang gửi/.test(await page.locator('main').textContent()));
  check('lead detail: axe-core -> 0 violations', (await axe(page)).length === 0, (await axe(page)).join('; '));
  await page.getByRole('button', { name: /Chuyển sang “Đang xử lý”/ }).click();
  await page.waitForLoadState('load');
  check('status New -> In progress: confirmation announced (role=status) and the badge changes', (await page.getByRole('status').textContent()) === 'Đã cập nhật trạng thái.' && (await page.locator('h1 .badge').textContent()) === 'Đang xử lý');
  await page.getByLabel(/Thêm ghi chú/).fill('Đã gọi 9h.\nHẹn gặp thứ Sáu.');
  await page.getByRole('button', { name: 'Lưu ghi chú' }).click();
  await page.waitForLoadState('load');
  const note = page.locator('.notes li').first();
  check('internal note: saved with author and time, line break preserved', /Đã gọi 9h\./.test(await note.textContent()) && (await note.textContent()).includes(USERS.staff.email) && (await note.locator('time').count()) === 1 && (await note.locator('p.pre').evaluate((e) => getComputedStyle(e).whiteSpace)) === 'pre-wrap');
  await page.getByRole('button', { name: /Đóng/ }).click();
  await page.waitForLoadState('load');
  check('status In progress -> Closed', (await page.locator('h1 .badge').textContent()) === 'Đã đóng');
  const html = await page.content();
  check('no script, inline style or event handler anywhere in the rendered CRM', !/<script|<style|\sstyle=|\son[a-z]+=/i.test(html));

  await page.getByRole('link', { name: 'Tài khoản' }).click();
  check('account page: axe-core -> 0 violations', (await axe(page)).length === 0, (await axe(page)).join('; '));

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForLoadState('load');
  check('sign-out: back on the login page with a confirmation, all CRM cookies gone', /\/admin\/login\//.test(page.url()) && /Bạn đã đăng xuất/.test(await page.locator('main').textContent()) && (await context.cookies()).filter((c) => c.name.startsWith('__Secure-vbfa-')).length === 0);
  await page.goBack();
  await page.waitForLoadState('load');
  check('after sign-out the Back button does not show lead data (no-store, re-requested -> login)', (await page.locator('main').textContent()).includes('Đăng nhập CRM') && !(await page.content()).includes('beta.invalid'));
  const direct = await page.goto(`${BASE}/admin/leads/`);
  check('after sign-out a direct visit to the inbox is 401 with the login form', direct.status() === 401 && (await page.getByLabel('Mật khẩu').count()) === 1);
  check('staff session: no console error, no failed request', page.problems.length === 0, page.problems.join('; '));
  await context.close();
}

check('the browser sends the real same-origin Origin header on every form post (not "null"): the CSRF check works in a real browser', browserOrigins.length >= 6 && browserOrigins.every((o) => o === BASE), [...new Set(browserOrigins)].join(', '));

/* ───────── 3. roles: staff cannot reach staff management; admin can use it ───────── */
{
  const { page, context } = await open();
  await signIn(page, 'staff');
  const denied = await page.goto(`${BASE}/admin/staff/`);
  check('staff opening /admin/staff/ gets 403 and a clear message', denied.status() === 403 && /Chỉ quản trị viên/.test(await page.locator('main').textContent()));
  await context.close();

  const admin = await open();
  await signIn(admin.page, 'admin');
  await admin.page.getByRole('link', { name: 'Người dùng CRM' }).click();
  check('administrator sees staff management with the three seeded people', (await admin.page.locator('tbody tr').count()) === 3);
  check('staff management: axe-core -> 0 violations', (await axe(admin.page)).length === 0, (await axe(admin.page)).join('; '));
  await admin.page.getByLabel(/Email \(đã có tài khoản/).fill('Moi.Vao@vbfa.test');
  await admin.page.getByLabel('Vai trò').selectOption('staff');
  await admin.page.getByLabel('Đặt lại liên kết').uncheck().catch(() => undefined);
  await admin.page.getByLabel('Đăng ký bản tin').uncheck();
  await admin.page.getByRole('button', { name: 'Lưu' }).click();
  await admin.page.waitForLoadState('load');
  check('administrator grants a new person a role and scope; confirmation announced; row appears with "chưa đăng nhập"', /Đã cấp quyền/.test(await admin.page.getByRole('status').textContent()) && /moi\.vao@vbfa\.test/.test(await admin.page.locator('tbody').textContent()) && /chưa đăng nhập/.test(await admin.page.locator('tbody').textContent()));
  check('...and the database holds exactly that role and scope', JSON.stringify((await q("select role, kinds from public.crm_staff where email = 'moi.vao@vbfa.test'"))[0]) === JSON.stringify({ role: 'staff', kinds: ['membership', 'contact'] }));
  await admin.page.getByRole('button', { name: /Vô hiệu hoá moi\.vao/ }).click();
  await admin.page.waitForLoadState('load');
  check('administrator deactivates the person', /Đã vô hiệu hoá/.test(await admin.page.getByRole('status').textContent()) && (await q("select active from public.crm_staff where email = 'moi.vao@vbfa.test'"))[0].active === false);
  await admin.context.close();
}

/* ───────── 4. a valid Auth user who is not staff ───────── */
{
  const { page, context } = await open();
  await signIn(page, 'outsider');
  check('a valid Auth account without CRM access is turned away exactly like a wrong password (no session, no data)', (await page.locator('[role=alert]').textContent()).includes('Email hoặc mật khẩu không đúng') && (await context.cookies()).filter((c) => c.name.startsWith('__Secure-vbfa-')).length === 0);
  await context.close();
}

/* ───────── 5. responsive: no horizontal overflow, touch targets, axe, at eight widths ───────── */
if (shots) mkdirSync('qa-artifacts/crm', { recursive: true });
const widths = [320, 375, 390, 430, 768, 1024, 1440, 1920];
const overflow = [];
const small = [];
const axeFindings = [];
for (const width of widths) {
  const { page, context } = await open(width, width < 768 ? 800 : 900);
  await page.goto(`${BASE}/admin/login/`);
  if (!(await noOverflow(page))) overflow.push(`${width}:login`);
  if (shots) await page.screenshot({ path: `qa-artifacts/crm/login-${width}.png`, fullPage: true });
  await signIn(page, 'admin');
  const targets = [['list', '/admin/leads/'], ['filtered', '/admin/leads/?status=contacted&kind=membership'], ['staff', '/admin/staff/'], ['account', '/admin/account/']];
  await page.goto(`${BASE}/admin/leads/?q=khach04`);
  await page.getByRole('link', { name: /Xem/ }).click();
  targets.push(['detail', new URL(page.url()).pathname]);
  for (const [label, path] of targets) {
    await page.goto(`${BASE}${path}`);
    if (!(await noOverflow(page))) overflow.push(`${width}:${label}`);
    if (width <= 430) {
      const tiny = await page.evaluate(() => [...document.querySelectorAll('a.btn, button, input:not([type=hidden]):not([type=checkbox]), select, textarea')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 40).map((e) => (e.getAttribute('name') ?? e.textContent ?? e.tagName).trim().slice(0, 30)));
      if (tiny.length) small.push(`${width}:${label}:${tiny.join(',')}`);
    }
    if (width === 320 || width === 1920) {
      const issues = await axe(page);
      if (issues.length) axeFindings.push(`${width}:${label}: ${issues.join('; ')}`);
    }
    if (shots && ['list', 'detail', 'staff'].includes(label)) await page.screenshot({ path: `qa-artifacts/crm/${label}-${width}.png`, fullPage: true });
  }
  await context.close();
}
check(`no horizontal page overflow on any screen at ${widths.join(' / ')} px`, overflow.length === 0, overflow.join(', '));
check('touch targets: every control is at least 40 px tall on phones (320-430 px)', small.length === 0, small.join(' | '));
check('axe-core at the narrowest and widest layouts (all screens) -> 0 violations', axeFindings.length === 0, axeFindings.join(' | '));

/* ───────── 6. reduced motion and zoom ───────── */
{
  const { page, context } = await open(1280, 900);
  await signIn(page, 'admin');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${BASE}/admin/leads/`);
  check('prefers-reduced-motion: no transition or animation on any element', await page.evaluate(() => [...document.querySelectorAll('*')].every((e) => { const s = getComputedStyle(e); return parseFloat(s.transitionDuration) === 0 && parseFloat(s.animationDuration) === 0; })));
  await page.setViewportSize({ width: 320, height: 640 }); // equals 400 % zoom at 1280 px
  check('400 % zoom equivalent (320 px with a desktop scrollbar): content reflows without horizontal scroll', await noOverflow(page), JSON.stringify(await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, clientWidth: document.documentElement.clientWidth, bodyScroll: document.body.scrollWidth, wide: [...document.querySelectorAll('body *')].map((e) => [e.tagName.toLowerCase() + '.' + e.className, Math.round(e.getBoundingClientRect().right)]).filter(([, r]) => r > 321).slice(0, 6) }))));
  await context.close();
}

await browser.close();
proxy.close();
host.stop();
await stack.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
