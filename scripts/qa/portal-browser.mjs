#!/usr/bin/env node
/**
 * Browser QA of the Admin Portal screens (Chromium) against the BUNDLED portal Function (the same esbuild bundle that ships as .vercel/output/functions/api/portal.func/index.mjs),
 * the real SQL (PGlite built from supabase/migrations) and a stand-in for Sanity's `users/me` (portal-fake-sanity.mjs).
 *
 *   node scripts/qa/portal-browser.mjs [--shots]
 *
 * What is real: the React screens, the API client, the Function bundle, request checks, authorization order, the SQL functions.
 * What is NOT: Sanity (the sandbox cannot reach it; its observed behavior is reproduced), the Studio shell (navigation bar, router,
 * sign-in) and Vercel. So this is NOT a "single sign-on PASS": that needs a real Sanity session (docs/evidence/ADMIN_PORTAL_*.md).
 */
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { SERVICE_KEY, startStack } from './crm-stack.mjs';

const shots = process.argv.includes('--shots');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`);
};
/** The screens load data after they render: on a slower machine a check must wait for the result, not for the first paint. */
const poll = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  let value = await fn();
  while (!value && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await fn();
  }
  return value;
};
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/* ───────── build: the Function bundle and the harness page ───────── */
// esbuild is a dependency of the Studio project (studio/package.json), not of the website.
const { build } = await import(pathToFileURL(createRequire(resolve('studio/package.json')).resolve('esbuild')).href);
const harnessDir = resolve('qa-artifacts/portal-harness');
mkdirSync(harnessDir, { recursive: true });
execFileSync(process.execPath, ['studio/scripts/bundle-portal.mjs', resolve(harnessDir, 'portal.mjs')], { stdio: 'inherit' });
await build({
  entryPoints: [resolve('studio/portal-harness/main.tsx')],
  outfile: resolve(harnessDir, 'harness.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"production"' },
  absWorkingDir: resolve('studio'),
  logLevel: 'error',
});
writeFileSync(resolve(harnessDir, 'index.html'), '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VBFA · Cổng quản trị (QA)</title><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script src="/harness.js"></script></body></html>');

/* ───────── data and identities ───────── */
const person = (n, email, extra = {}) => ({ sanityUserId: `s-${n}`, email, provider: 'google', roles: [{ name: 'editor', title: 'Editor' }], ...extra });
const TOKENS = {
  admin: 'tok-admin-0123456789abcdefghij',
  staff: 'tok-staff-0123456789abcdefghij',
  news: 'tok-news-0123456789abcdefghij',
  outsider: 'tok-outsider-0123456789abcdefghij',
  robot: 'tok-robot-0123456789abcdefghij',
  unknown: 'tok-unknown-0123456789abcdefghij',
};
const SANITY_USERS = {
  [TOKENS.admin]: person('admin', 'admin@vbfa.test'),
  [TOKENS.staff]: person('staff', 'staff@vbfa.test'),
  [TOKENS.news]: person('news', 'news@vbfa.test'),
  [TOKENS.outsider]: person('outsider', 'outsider@vbfa.test'),
  [TOKENS.robot]: { sanityUserId: 's-robot', provider: 'sanity-token', roles: [{ name: 'developer' }], givenName: 'Deploy (Robot)' },
};

const stack = await startStack();
const { q } = stack;
for (let i = 0; i < 27; i++) {
  await q('insert into public.website_leads (kind, name, company, email, consent, consent_text_version, source_path, created_at) values ($1,$2,$3,$4,true,$5,$6, now() - ($7 || \' minutes\')::interval)',
    ['membership', `Khách số ${String(i).padStart(2, '0')}`, i % 2 ? 'Công ty Xanh' : 'Hiệp hội Sinh khối', `khach${String(i).padStart(2, '0')}@beta.invalid`, 'join-v2', i % 3 ? '/' : '/tin-tuc/', String(i * 7)]);
}
for (let i = 0; i < 3; i++) await q("insert into public.website_leads (kind, email, consent, consent_text_version, source_path) values ('newsletter', $1, true, 'newsletter-v1', '/tin-tuc/')", [`ban-tin-${i}@beta.invalid`]);
await q("insert into public.website_leads (kind, name, company, email, message, consent, consent_text_version) values ('membership', $1, $2, 'xss@beta.invalid', $3, true, 'join-v2')", ['<img src=x onerror=window.__xss=1>', '"><script>window.__xss=2</script>', 'Dòng 1\n<b>Dòng 2</b>']);
await q("insert into public.crm_staff (email, role, kinds, created_by) values ('admin@vbfa.test', 'admin', array['membership','newsletter','contact'], 'qa') on conflict do nothing");

/* ───────── host ───────── */
const hostEnv = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0', SUPABASE_URL: stack.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SANITY_STUDIO_PROJECT_ID: 'iqyx5ttc', FAKE_SANITY_USERS: JSON.stringify(SANITY_USERS) };
const child = spawn(process.execPath, ['--import', resolve('scripts/qa/portal-fake-sanity.mjs'), resolve('scripts/qa/portal-host.mjs'), harnessDir], { env: hostEnv, stdio: ['ignore', 'pipe', 'pipe'] });
const hostLogs = [];
const port = await new Promise((ok, fail) => {
  const timer = setTimeout(() => fail(new Error('host did not start')), 20_000);
  const onData = (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      const ready = /^HOST_READY (\d+)$/.exec(line);
      if (ready) {
        clearTimeout(timer);
        ok(Number(ready[1]));
      } else hostLogs.push(line);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', () => fail(new Error(`host exited: ${hostLogs.join(' | ').slice(0, 300)}`)));
});
const BASE = `http://127.0.0.1:${port}`;
if (process.argv.includes('--serve-only')) {
  // Debug aid: keep the host and the database up so a person (or an ad-hoc script) can drive the harness.
  console.log(`SERVING ${BASE}/?token=${TOKENS.admin}#staff`);
  await new Promise((done) => setTimeout(done, Number(process.env.QA_SERVE_MS ?? 600_000)));
  child.kill();
  process.exit(0);
}

/* ───────── browser ───────── */
const browser = await chromium.launch();
const consoleProblems = [];
const apiCalls = [];
const dialogs = [];
async function open(token, hash, { width = 1280, height = 900, negative = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  // The browser logs every 4xx answer as a console error. The tests make refused calls on purpose (conflict, IDOR, wrong role); any OTHER
  // console error or warning (script errors, CSP, React) still counts.
  page.on('console', (m) => !negative && ['error', 'warning'].includes(m.type()) && !/^Failed to load resource: the server responded with a status of (400|401|403|404|409)\b/.test(m.text()) && consoleProblems.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${String(e).slice(0, 200)}`));
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  page.on('request', (r) => r.url().includes('/api/portal') && apiCalls.push({ method: r.method(), url: r.url(), headers: r.headers(), body: r.postData() }));
  await page.goto(`${BASE}/${token ? `?token=${token}` : ''}#${hash}`);
  return { context, page };
}
const axe = async (page, label) => {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } })).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.html?.slice(0, 80)} ${v.id === 'color-contrast' ? JSON.stringify(v.nodes.map((n) => { const d = n.any[0]?.data ?? {}; return `${d.fgColor} on ${d.bgColor} = ${d.contrastRatio} (${(n.html.match(/>([^<]{1,30})</) ?? [])[1] ?? ''})`; })) : ''}`));
  check(`axe-core, no violations: ${label}`, result.length === 0, result.join(' | '));
};
const snap = async (page, name) => shots && (mkdirSync('docs/evidence/portal-screenshots', { recursive: true }), await page.screenshot({ path: `docs/evidence/portal-screenshots/${name}.png`, fullPage: true }));
const rowsOf = (page) => page.locator('tbody tr');
const audit = async (action) => (await q('select actor_email, detail from public.crm_audit_log where action = $1 order by id', [action]));

try {
  /* ─── A. who is calling ─── */
  {
    const { context, page } = await open(TOKENS.outsider, 'leads', { negative: true });
    await page.getByText('chưa được cấp quyền quản lý Lead').waitFor();
    check('a Sanity member who is not on the allowlist sees the refusal and no data', (await page.locator('table').count()) === 0 && !(await page.content()).includes('beta.invalid'));
    check('the refusal is recorded once in the audit trail', (await audit('denied')).filter((r) => r.actor_email === 'outsider@vbfa.test').length === 1);
    await axe(page, 'refusal screen');
    await context.close();
  }
  {
    const { context, page } = await open(TOKENS.unknown, 'leads', { negative: true });
    await page.getByText('Phiên đăng nhập Sanity đã hết hạn').waitFor();
    check('a token Sanity does not know: session-expired message, no data', (await page.locator('table').count()) === 0);
    await context.close();
  }
  {
    const before = apiCalls.length;
    const { context, page } = await open('', 'leads', { negative: true });
    await page.getByText('Phiên đăng nhập Sanity đã hết hạn').waitFor();
    check('no token at all: the client refuses without calling the server', apiCalls.length === before);
    await context.close();
  }
  {
    const { context, page } = await open(TOKENS.robot, 'leads', { negative: true });
    await page.getByText('Loại tài khoản này không được dùng').waitFor();
    check('an API (robot) token is told it cannot manage leads', (await page.locator('table').count()) === 0);
    await context.close();
  }

  /* ─── B. staff with the full scope ─── */
  {
    const { context, page } = await open(TOKENS.staff, 'overview');
    await page.getByRole('heading', { name: 'VBFA · Cổng quản trị' }).waitFor();
    await page.getByText('khách mới').waitFor();
    const fresh = Number((await q("select count(*)::int as n from public.website_leads where status = 'new'"))[0].n);
    check('overview counts match the database', (await page.getByText(`${fresh}`, { exact: false }).count()) > 0 && (await page.content()).includes(`<strong>${fresh}</strong>`));
    check('overview offers content and leads, and no staff card to a plain staff member', (await page.getByRole('button', { name: 'Mở quản trị nhân sự' }).count()) === 0 && (await page.getByRole('button', { name: 'Mở danh sách Lead' }).count()) === 1);
    await axe(page, 'overview (staff)');
    await snap(page, 'overview-1280');
    await page.getByRole('button', { name: 'Mở danh sách Lead' }).click();
    await page.getByRole('heading', { name: 'Quản lý Lead' }).waitFor();
    check('the overview card leads to the Leads tool', page.url().endsWith('#leads'));

    // list, pagination
    await page.getByText('Hiển thị 1–25 / 31 khách').waitFor();
    check('first page shows 25 rows of 31', (await rowsOf(page).count()) === 25);
    await page.getByRole('button', { name: 'Trang sau ›' }).click();
    await page.getByText('Hiển thị 26–31 / 31 khách').waitFor();
    check('second page shows the remaining 6 rows', (await rowsOf(page).count()) === 6);
    await page.getByRole('button', { name: '‹ Trang trước' }).click();
    await page.getByText('Hiển thị 1–25 / 31 khách').waitFor();

    // filters
    await page.getByLabel('Loại').selectOption('newsletter');
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    await page.getByText('Hiển thị 1–3 / 3 khách').waitFor();
    check('filter by kind (newsletter) shows 3', (await rowsOf(page).count()) === 3);
    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click();
    await page.getByText('Hiển thị 1–25 / 31 khách').waitFor();
    await page.getByLabel('Tìm (tên, email, công ty)').fill('khach07');
    await page.keyboard.press('Enter');
    await page.getByText('Hiển thị 1–1 / 1 khách').waitFor();
    check('search by e-mail (submitted with Enter) finds exactly one', (await rowsOf(page).count()) === 1 && (await rowsOf(page).first().textContent()).includes('Khách số 07'));
    await page.getByLabel('Tìm (tên, email, công ty)').fill('không-có-ai-tên-này');
    await page.getByRole('button', { name: 'Lọc', exact: true }).click();
    await page.getByText('Không có khách nào khớp bộ lọc.').waitFor();
    check('an empty result says so', (await rowsOf(page).count()) === 0);
    await page.getByRole('button', { name: 'Xoá bộ lọc' }).click();
    await page.getByText('Hiển thị 1–25 / 31 khách').waitFor();
    await axe(page, 'leads list');
    await snap(page, 'leads-1280');

    // detail by keyboard
    await page.getByLabel('Tìm (tên, email, công ty)').fill('khach07');
    await page.keyboard.press('Enter');
    await page.getByText('Hiển thị 1–1 / 1 khách').waitFor();
    const open07 = page.getByRole('button', { name: 'Mở chi tiết Khách số 07' });
    await open07.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Chi tiết khách' }).waitFor();
    await page.getByText('khach07@beta.invalid').first().waitFor();
    check('opening a lead by keyboard moves focus to the detail heading', await poll(() => page.evaluate(() => document.activeElement?.textContent === 'Chi tiết khách')));
    await page.getByText('Thời điểm đồng ý').first().waitFor();
    check('detail shows consent version, time and source page', await poll(async () => (await page.getByText('join-v2').count()) > 0 && (await page.getByText('Thời điểm đồng ý').count()) === 1 && (await page.getByText('Trang gửi').count()) === 1));
    await axe(page, 'lead detail');
    await snap(page, 'detail-1280');

    // status workflow
    await page.getByRole('button', { name: 'Chuyển sang “Đang xử lý”' }).click();
    await page.getByText('Đã chuyển sang “Đang xử lý”.').waitFor();
    check('status New -> In progress is stored', (await q("select status from public.website_leads where email = 'khach07@beta.invalid'"))[0].status === 'contacted');
    // a stale screen: somebody else closes the lead behind our back
    await q("update public.website_leads set status = 'closed' where email = 'khach07@beta.invalid'");
    await page.getByRole('button', { name: 'Chuyển sang “Mới”' }).click();
    await page.getByText('Trạng thái vừa được người khác thay đổi').waitFor();
    check('a stale status change is refused, nothing overwritten, and the screen shows the truth', (await q("select status from public.website_leads where email = 'khach07@beta.invalid'"))[0].status === 'closed' && (await page.getByText('Đã đóng').count()) > 0);

    // notes
    const save = page.getByRole('button', { name: 'Lưu ghi chú' });
    check('saving an empty note is disabled', await save.isDisabled());
    await page.getByLabel('Thêm ghi chú').fill('Gọi lại thứ Hai\nvề hội viên <b>x</b>');
    await save.click();
    await page.getByText('Đã lưu ghi chú.').waitFor();
    const note = (await q("select author_email, body from public.lead_notes order by created_at desc limit 1"))[0];
    check('a multi-line note is stored with the author from the database', note.author_email === 'staff@vbfa.test' && note.body === 'Gọi lại thứ Hai\nvề hội viên <b>x</b>');
    await page.locator('li', { hasText: 'staff@vbfa.test' }).first().waitFor(); // the list is reloaded after "saved"
    const shownAsText = await poll(async () => (await page.locator('li', { hasText: 'staff@vbfa.test' }).count()) === 1 && (await page.locator('li b').count()) === 0);
    check('the note is shown as text (markup not interpreted) with author and time', shownAsText, `li with author: ${await page.locator('li', { hasText: 'staff@vbfa.test' }).count()}, li b: ${await page.locator('li b').count()}`);
    await page.getByRole('button', { name: 'Đóng' }).click();

    // hostile lead content
    await page.getByLabel('Tìm (tên, email, công ty)').fill('xss@beta');
    await page.keyboard.press('Enter');
    await page.getByText('Hiển thị 1–1 / 1 khách').waitFor();
    await page.getByRole('button', { name: /Mở chi tiết/ }).click();
    await page.getByRole('heading', { name: 'Chi tiết khách' }).waitFor();
    await page.waitForTimeout(300);
    check('markup in lead data is shown as text: no element injected, no script run, no dialog', (await page.locator('img[src="x"]').count()) === 0 && (await page.evaluate(() => window.__xss)) === undefined && dialogs.length === 0);
    check('line breaks of a message are kept', (await page.getByText('Dòng 1').count()) > 0);
    await context.close();
  }

  /* ─── C. newsletter-only staff: scope ─── */
  {
    const { context, page } = await open(TOKENS.news, 'leads');
    await page.getByText('Hiển thị 1–3 / 3 khách').waitFor();
    check('a newsletter-only person sees only the 3 newsletter leads', (await rowsOf(page).count()) === 3 && !(await page.content()).includes('khach0'));
    const kinds = await page.getByLabel('Loại').locator('option').allTextContents();
    check('the kind filter offers only the person\'s scope', kinds.join('|') === 'Tất cả|Bản tin', kinds.join('|'));
    const result = await page.evaluate(async (token) => {
      const r = await fetch('/api/portal', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'leads.get', id: window.__id }) });
      return r.status;
    }, TOKENS.news);
    check('a direct API call by id outside the scope is refused (400/404), not served', result === 400 || result === 404);
    const outOfScope = (await q("select id from public.website_leads where kind = 'membership' limit 1"))[0].id;
    const direct = await page.evaluate(async ([token, id]) => (await fetch('/api/portal', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'leads.get', id }) })).status, [TOKENS.news, outOfScope]);
    check('IDOR: a real membership lead id requested by the newsletter-only person gives 404', direct === 404);
    await context.close();
  }

  /* ─── D. administrator ─── */
  {
    const { context, page } = await open(TOKENS.staff, 'staff');
    await page.getByText('Chỉ quản trị viên được dùng chức năng này.').waitFor();
    check('a plain staff member opening the staff tool is told it is admin-only', (await page.locator('table').count()) === 0);
    await context.close();
  }
  {
    const { context, page } = await open(TOKENS.admin, 'overview');
    await page.getByRole('button', { name: 'Mở quản trị nhân sự' }).waitFor();
    check('an administrator also gets the staff card', true);
    await page.getByRole('button', { name: 'Mở quản trị nhân sự' }).click();
    await page.getByRole('heading', { name: 'Quản trị nhân sự' }).waitFor();
    await page.getByRole('cell', { name: 'staff@vbfa.test', exact: true }).waitFor();
    await axe(page, 'staff management');
    await snap(page, 'staff-1280');

    if (process.env.QA_DEBUG_SHOT) await page.screenshot({ path: process.env.QA_DEBUG_SHOT, fullPage: true });
    await page.getByLabel('Email (đúng email tài khoản Sanity)').fill('moi.vao@vbfa.test');
    await page.getByLabel('Vai trò').selectOption('staff');
    await page.getByLabel('Hội viên').uncheck();
    await page.getByLabel('Liên hệ').uncheck();
    await page.getByRole('button', { name: 'Lưu nhân sự' }).click();
    await page.getByRole('cell', { name: 'moi.vao@vbfa.test', exact: true }).waitFor();
    const added = (await q("select role, kinds, created_by from public.crm_staff where email = 'moi.vao@vbfa.test'"))[0];
    check('inviting a person stores role and scope and who invited them', added.role === 'staff' && added.kinds.join() === 'newsletter' && added.created_by === 'admin@vbfa.test');

    await page.getByRole('button', { name: 'Vô hiệu hoá moi.vao@vbfa.test' }).click();
    await page.getByText('Đã vô hiệu hoá: người này mất quyền').waitFor();
    check('deactivating a person is stored', (await q("select active from public.crm_staff where email = 'moi.vao@vbfa.test'"))[0].active === false);

    const reset = page.getByRole('button', { name: 'Đặt lại liên kết đăng nhập của staff@vbfa.test' });
    check('reset of the sign-in link is possible for a person who has signed in', await reset.isEnabled());
    await reset.click();
    await page.getByText('Đã đặt lại.').waitFor();
    check('the reset clears both bindings', (await q("select user_id, sanity_user_id from public.crm_staff where email = 'staff@vbfa.test'"))[0].sanity_user_id === null);
    check('the reset keeps the role and the scope as they were (a stale screen cannot write them back)', JSON.stringify((await q("select role, kinds from public.crm_staff where email = 'staff@vbfa.test'"))[0]) === JSON.stringify({ role: 'staff', kinds: ['membership', 'newsletter', 'contact'] }));
    check('an administrator cannot reset their own sign-in link from the screen', await page.getByRole('button', { name: 'Đặt lại liên kết đăng nhập của admin@vbfa.test' }).isDisabled());

    await page.getByRole('button', { name: 'Vô hiệu hoá admin@vbfa.test' }).click();
    await page.getByText('Không thể gỡ quản trị viên cuối cùng.').waitFor();
    check('the last administrator cannot be deactivated', (await q("select active from public.crm_staff where email = 'admin@vbfa.test'"))[0].active === true);
    await context.close();
  }

  /* ─── E. credentials and transport ─── */
  {
    const posts = apiCalls.filter((c) => c.url.endsWith('/api/portal'));
    check('every call is a POST to /api/portal with no query string', posts.length > 20 && posts.every((c) => c.method === 'POST' && new URL(c.url).search === ''), `${posts.length} calls`);
    check('the token travels only in the Authorization header: not in the URL, the body or a cookie', posts.every((c) => !c.url.includes('tok-') && !(c.body ?? '').includes('tok-') && !('cookie' in c.headers) && /^Bearer tok-/.test(c.headers.authorization ?? '')));
    const { context, page } = await open(TOKENS.staff, 'leads');
    await page.getByText('Hiển thị').first().waitFor();
    check('the page keeps nothing of ours in cookies or storage', (await context.cookies()).length === 0 && (await page.evaluate(() => localStorage.length + sessionStorage.length)) === 0);
    const headers = await page.evaluate(async (token) => { const r = await fetch('/api/portal', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ op: 'session' }) }); return Object.fromEntries(r.headers); }, TOKENS.staff);
    check('answers are no-store, nosniff and noindex', headers['cache-control'].includes('no-store') && headers['x-content-type-options'] === 'nosniff' && headers['x-robots-tag'].includes('noindex'));
    await context.close();
  }

  /* ─── F. responsive ─── */
  for (const width of [320, 375, 768, 1024, 1440]) {
    const { context, page } = await open(TOKENS.admin, 'leads', { width, height: 900 });
    await page.getByText('Hiển thị').first().waitFor();
    await page.getByRole('button', { name: /Mở chi tiết/ }).first().click();
    await page.getByRole('heading', { name: 'Chi tiết khách' }).waitFor();
    const wide = () => page.evaluate(() => { const limit = window.innerWidth + 1; if (document.documentElement.scrollWidth <= limit) return ''; const bad = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > limit && !e.closest('[data-overflow-ok]')).slice(0, 3); return bad.map((e) => `${e.tagName}[${e.getAttribute('data-ui') ?? ''}]${e.id ? '#' + e.id : ''} right=${Math.round(e.getBoundingClientRect().right)}`).join(', ') || 'document wider than window'; });
    const leadsWide = await wide();
    const leads = leadsWide === '';
    await page.goto(`${BASE}/?token=${TOKENS.admin}#staff`);
    await page.getByRole('heading', { name: 'Quản trị nhân sự' }).waitFor();
    const staffWide = await wide();
    const staff = staffWide === '';
    check(`no sideways scrolling of the page at ${width}px (leads with detail, staff)`, leads && staff, `leads: ${leadsWide} | staff: ${staffWide}`);
    if (width === 375) await snap(page, 'staff-375');
    await context.close();
  }
  {
    const { context, page } = await open(TOKENS.staff, 'leads', { width: 375, height: 800 });
    await page.getByText('Hiển thị').first().waitFor();
    await snap(page, 'leads-375');
    await page.getByRole('button', { name: /Mở chi tiết/ }).first().click();
    await page.getByRole('heading', { name: 'Chi tiết khách' }).waitFor();
    await axe(page, 'lead detail at 375px');
    await context.close();
  }

  check('no console errors or warnings in any screen', consoleProblems.length === 0, consoleProblems.slice(0, 3).join(' | '));
  const logs = hostLogs.join('\n');
  check('the Function logged operation, status, role and duration only: no e-mail, token or lead data', logs.includes('portal.request') && !/@|tok-|beta\.invalid|Khách số/.test(logs), logs.slice(0, 200));
} finally {
  await browser.close();
  child.kill();
  await stack.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
