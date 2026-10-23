import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ABSOLUTE_MS, COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_SESSION, IDLE_MS, signSession } from './session';
import { handleCrm, safeNext, type CrmDeps } from './app';
import { browser, captureLogs, createTestDatabase, fakeAuth, ORIGIN, pgliteStore, type FakeUser } from './test-support';
import { escapeHtml, html, raw } from './html';

/**
 * The CRM request handler against the REAL SQL functions (PGlite built from the migrations) and a fake Supabase Auth.
 * What is real here: routing, session cookies, authorization, throttling, status workflow, notes, audit trail, HTML output.
 * What is not: Supabase Auth itself (a fake) and the network; those are covered by the real-service E2E.
 */
const SECRET = 'service-role-secret-for-tests';
const person = (name: string, n: number): FakeUser => ({ email: `${name}@vbfa.test`, password: `Correct-Horse-${n}!`, id: `00000000-0000-4000-8000-00000000000${n}` });
const ADMIN = person('admin', 1);
const STAFF = person('staff', 2);
const NEWS = person('news', 3);
const OUTSIDER = person('outsider', 4); // a valid Auth user who is NOT on the CRM allowlist
const UNCONFIRMED = { ...person('pending', 5), confirmed: false };

let db: PGlite;
let now = Date.parse('2026-10-23T08:00:00Z');
let auth = fakeAuth([]);
let logs = captureLogs();

const deps = (): CrmDeps => ({ store: pgliteStore(db), auth: auth.client, log: logs.log, sessionSecret: SECRET, ipSalt: 'test-salt', now: () => now });
const newBrowser = () => browser(deps);
type Browser = ReturnType<typeof newBrowser>;

async function signIn(b: Browser, who: FakeUser, next?: string) {
  return b.send('/admin/login/', { form: { email: who.email, password: who.password, ...(next ? { next } : {}) } });
}
async function insertLead(over: Record<string, unknown> = {}): Promise<string> {
  const row = { kind: 'membership', name: 'Nguyễn Văn A', company: 'ABC', email: `l${Math.random().toString(36).slice(2, 10)}@lead.test`, consent: true, consent_text_version: 'join-v2', source_path: '/', ...over };
  const keys = Object.keys(row);
  return (await db.query<{ id: string }>(`insert into public.website_leads (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(row))).rows[0]!.id;
}
const audit = async (action: string) => (await db.query<{ actor_email: string | null; lead_id: string | null; detail: Record<string, unknown> }>('select actor_email, lead_id, detail from public.crm_audit_log where action = $1 order by id', [action])).rows;
const status = async (id: string) => (await db.query<{ status: string }>('select status from public.website_leads where id = $1', [id])).rows[0]!.status;

beforeAll(async () => {
  db = await createTestDatabase();
  await db.exec(`insert into public.crm_staff (email, role, created_by) values ('${ADMIN.email}', 'admin', 'test'), ('${STAFF.email}', 'staff', 'test');
    insert into public.crm_staff (email, role, kinds, created_by) values ('${NEWS.email}', 'staff', array['newsletter'], 'test');`);
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  now = Date.parse('2026-10-23T08:00:00Z');
  auth = fakeAuth([ADMIN, STAFF, NEWS, OUTSIDER, UNCONFIRMED]);
  logs = captureLogs();
  await db.exec('delete from public.crm_login_attempts');
});

describe('html helper', () => {
  it('escapes everything except explicit fragments', () => {
    expect(String(html`<p>${'<script>alert("x")</script>'}</p>`)).toBe('<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
    expect(String(html`<b>${html`<i>${'a&b'}</i>`}</b>${raw('<hr>')}${['<', '>']}${null}${false}`)).toBe('<b><i>a&amp;b</i></b><hr>&lt;&gt;');
    expect(escapeHtml("'")).toBe('&#39;');
  });
});

describe('open redirect guard', () => {
  it('only accepts paths inside /admin/', () => {
    expect(safeNext('/admin/leads/?status=new')).toBe('/admin/leads/?status=new');
    for (const bad of ['https://evil.example/', '//evil.example', '/admin//evil', '/\\evil', '/admin/login/', '/admin/logout/', '/other/', 'admin/leads/', '/admin/leads/<script>', undefined, null, 5, `/admin/${'a'.repeat(400)}`]) expect(safeNext(bad), String(bad)).toBeUndefined();
  });
});

describe('unauthenticated access', () => {
  it('answers 401 with the login page for every protected page and never any lead data', async () => {
    await insertLead({ name: 'Secret Person', email: 'secret.person@lead.test' });
    const b = newBrowser();
    for (const path of ['/admin/', '/admin/leads/', '/admin/leads/00000000-0000-4000-8000-000000000099/', '/admin/staff/', '/admin/account/']) {
      const r = await b.send(path);
      expect(r.status, path).toBe(401);
      expect(r.text, path).toContain('Đăng nhập CRM');
      expect(r.text).not.toContain('secret.person');
      expect(r.headers.get('set-cookie')).toBeNull();
    }
  });

  it('answers 401 to state-changing posts without a session, and changes nothing', async () => {
    const id = await insertLead({ email: 'anon.target@lead.test' });
    const b = newBrowser();
    expect((await b.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'closed' } })).status).toBe(401);
    expect((await b.send(`/admin/leads/${id}/note/`, { form: { body: 'x' } })).status).toBe(401);
    expect((await b.send('/admin/staff/', { form: { action: 'upsert', email: 'a@b.co', role: 'admin', kind: 'membership' } })).status).toBe(401);
    expect(await status(id)).toBe('new');
  });

  it('sends the login page back with the page the person wanted as a safe `next`', async () => {
    const r = await newBrowser().send('/admin/leads/?status=new');
    expect(r.text).toContain('name="next" value="/admin/leads/?status=new"');
  });

  it('treats unknown paths and methods strictly', async () => {
    const b = newBrowser();
    expect((await b.send('/admin/nope/')).status).toBe(404);
    expect((await b.send('/admin/leads/x/y/z/')).status).toBe(404);
    expect((await b.send('/admin/logout/', { method: 'GET' })).status).toBe(405);
    const put = await b.send('/admin/leads/', { method: 'PUT', origin: ORIGIN });
    expect(put.status).toBe(405);
    expect(put.headers.get('allow')).toBe('GET');
    expect((await b.send('/admin/login/', { method: 'DELETE' })).headers.get('allow')).toBe('GET, POST');
  });
});

describe('sign-in', () => {
  it('signs an allowlisted, confirmed person in with hardened cookies and lands on the Lead Inbox', async () => {
    const b = newBrowser();
    const r = await signIn(b, STAFF);
    expect(r.status).toBe(303);
    expect(r.location).toBe('/admin/leads/');
    const cookies = (r.headers.getSetCookie());
    expect(cookies.map((c) => c.split('=')[0]).sort()).toEqual([COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_SESSION].sort());
    for (const c of cookies) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Secure');
      expect(c).toContain('SameSite=Strict');
      expect(c).toContain('Path=/admin');
      expect(c).toMatch(/Max-Age=\d+/);
    }
    expect((await b.send('/admin/leads/')).status).toBe(200);
    expect((await audit('login')).at(-1)).toMatchObject({ actor_email: STAFF.email, detail: { bound: expect.any(Boolean) } });
  });

  it('gives a wrong password, an unknown e-mail, an unconfirmed account and a valid-but-not-staff account the SAME answer', async () => {
    const answers = [];
    for (const attempt of [{ email: STAFF.email, password: 'wrong-password' }, { email: 'ghost@vbfa.test', password: 'whatever' }, { email: UNCONFIRMED.email, password: UNCONFIRMED.password }, { email: OUTSIDER.email, password: OUTSIDER.password }]) {
      const r = await newBrowser().send('/admin/login/', { form: attempt });
      expect(r.status).toBe(401);
      expect(r.headers.get('set-cookie') ?? '').not.toContain(COOKIE_ACCESS + '=a'); // no session cookie is issued
      answers.push(r.text.replace(/value="[^"]*"/g, ''));
    }
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain('Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền CRM.');
    expect((await audit('denied')).some((a) => a.actor_email === OUTSIDER.email)).toBe(true);
    expect(auth.activeSessions()).toBe(0); // the throw-away Auth sessions were revoked
  });

  it('asks for both fields and rejects malformed input without touching Auth', async () => {
    const b = newBrowser();
    expect((await b.send('/admin/login/', { form: { email: '', password: '' } })).status).toBe(400);
    expect(auth.state.calls.signIn).toBe(0);
  });

  it('throttles repeated attempts for one e-mail (even a correct password is refused during the window)', async () => {
    const b = newBrowser();
    for (let i = 0; i < 8; i++) expect((await b.send('/admin/login/', { form: { email: STAFF.email, password: `wrong-${i}` } })).status).toBe(401);
    const blocked = await b.send('/admin/login/', { form: { email: STAFF.email, password: STAFF.password }, ip: '198.51.100.77' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBe('60');
    expect(auth.state.calls.signIn).toBe(8);
    // the throttle window is measured by the database clock: age the attempts instead of moving the test clock
    await db.exec("update public.crm_login_attempts set created_at = created_at - interval '11 minutes'");
    expect((await newBrowser().send('/admin/login/', { form: { email: STAFF.email, password: STAFF.password } })).status).toBe(303);
  });

  it('throttles one address across many e-mails', async () => {
    for (let i = 0; i < 20; i++) await newBrowser().send('/admin/login/', { form: { email: `bot${i}@vbfa.test`, password: 'x' }, ip: '192.0.2.50' });
    expect((await newBrowser().send('/admin/login/', { form: { email: STAFF.email, password: STAFF.password }, ip: '192.0.2.50' })).status).toBe(429);
  });

  it('follows a safe `next` and ignores an unsafe one', async () => {
    expect((await signIn(newBrowser(), STAFF, '/admin/leads/?status=contacted')).location).toBe('/admin/leads/?status=contacted');
    for (const evil of ['https://evil.example/', '//evil.example', '/admin//evil']) expect((await signIn(newBrowser(), STAFF, evil)).location).toBe('/admin/leads/');
  });

  it('reports an Auth outage as 503, not as a wrong password', async () => {
    auth.state.down = true;
    expect((await signIn(newBrowser(), STAFF)).status).toBe(503);
  });

  it('binds the Auth user to the allowlist: a different Auth user with the same e-mail is refused', async () => {
    await db.exec(`insert into public.crm_staff (email, role, created_by) values ('twin@vbfa.test', 'staff', 'test')`);
    auth = fakeAuth([{ email: 'twin@vbfa.test', password: 'Twin-Password-1!', id: '00000000-0000-4000-8000-0000000000f1' }]);
    expect((await signIn(newBrowser(), { email: 'twin@vbfa.test', password: 'Twin-Password-1!', id: '' })).status).toBe(303);
    auth = fakeAuth([{ email: 'twin@vbfa.test', password: 'Other-Password-2!', id: '00000000-0000-4000-8000-0000000000f2' }]);
    expect((await signIn(newBrowser(), { email: 'twin@vbfa.test', password: 'Other-Password-2!', id: '' })).status).toBe(401);
  });
});

describe('same-origin enforcement on posts', () => {
  it('refuses a foreign Origin, a missing Origin, cross-site fetch metadata and non-form content', async () => {
    const b = newBrowser();
    const form = { email: STAFF.email, password: STAFF.password };
    expect((await b.send('/admin/login/', { form, origin: 'https://evil.example' })).status).toBe(403);
    expect((await b.send('/admin/login/', { form, origin: null })).status).toBe(403);
    expect((await b.send('/admin/login/', { form, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await b.send('/admin/login/', { form, headers: { 'sec-fetch-site': 'same-site' } })).status).toBe(403);
    expect((await b.send('/admin/login/', { form, headers: { 'content-type': 'application/json' } })).status).toBe(415);
    expect((await b.send('/admin/login/', { raw: 'email=a&password=' + 'x'.repeat(40_000) })).status).toBe(413);
    expect(auth.state.calls.signIn).toBe(0);
  });

  it('also protects authenticated actions (cross-site status change does nothing)', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const id = await insertLead({ email: 'csrf@lead.test' });
    expect((await b.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'closed' }, origin: 'https://evil.example' })).status).toBe(403);
    expect((await b.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'closed' }, headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect(await status(id)).toBe('new');
  });

  it('allows an extra origin only when configured', async () => {
    const d = { ...deps(), allowedOrigins: ['https://www.vbfa.example'] };
    const make = (origin: string) => new Request(`${ORIGIN}/admin/login/`, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=&password=' });
    expect((await handleCrm(make('https://www.vbfa.example'), '203.0.113.1', d)).status).toBe(400); // reached validation
    expect((await handleCrm(make('https://evil.example'), '203.0.113.1', d)).status).toBe(403);
  });
});

describe('sessions', () => {
  it('signs out: the cookies are cleared, the Auth session is revoked, and a copied cookie stops working', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const stolen = new Map(b.jar);
    const r = await b.send('/admin/logout/', { form: {} });
    expect(r.status).toBe(303);
    expect(r.location).toBe('/admin/login/?done=out');
    expect(b.jar.size).toBe(0);
    expect(auth.activeSessions()).toBe(0);
    expect((await audit('logout')).at(-1)).toMatchObject({ actor_email: STAFF.email });
    // replay the old cookies from another client
    const attacker = newBrowser();
    for (const [name, value] of stolen) attacker.setCookie(name, value);
    expect((await attacker.send('/admin/leads/')).status).toBe(401);
    expect((await b.send('/admin/login/?done=out')).text).toContain('Bạn đã đăng xuất.');
  });

  it('logs out cleanly even without a session', async () => {
    const r = await newBrowser().send('/admin/logout/', { form: {} });
    expect(r.status).toBe(303);
  });

  it('expires after 30 minutes of inactivity and slides while the person is active', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    for (let i = 0; i < 4; i++) {
      now += IDLE_MS - 60_000;
      expect((await b.send('/admin/leads/')).status).toBe(200); // active: the idle clock restarts
    }
    now += IDLE_MS + 1000;
    const r = await b.send('/admin/leads/');
    expect(r.status).toBe(401);
    expect(r.headers.getSetCookie().every((c) => /Max-Age=0/.test(c))).toBe(true);
    expect(b.jar.size).toBe(0);
  });

  it('expires 8 hours after sign-in however active the person is', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const hops = 18;
    for (let i = 0; i < hops; i++) {
      now += ABSOLUTE_MS / hops - 1000;
      expect((await b.send('/admin/leads/')).status, `hop ${i}`).toBe(200);
    }
    now += 60_000;
    expect((await b.send('/admin/leads/')).status).toBe(401);
  });

  it('rejects a tampered, forged or truncated session clock', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const real = b.jar.get(COOKIE_SESSION)!;
    const [started, last, sig] = real.split('.');
    for (const forged of [`${Number(started) + 5}.${last}.${sig}`, `${started}.${Number(last) + 5}.${sig}`, `${started}.${last}.${'0'.repeat(64)}`, `${started}.${last}`, 'junk', '', await signSession('another-secret', now, now)]) {
      const c = newBrowser();
      for (const [k, v] of b.jar) c.setCookie(k, v);
      c.setCookie(COOKIE_SESSION, forged);
      expect((await c.send('/admin/leads/')).status, forged.slice(0, 30)).toBe(401);
    }
  });

  it('needs all three cookies: Auth tokens without the signed clock are not enough', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    b.jar.delete(COOKIE_SESSION);
    expect((await b.send('/admin/leads/')).status).toBe(401);
    const c = newBrowser();
    await signIn(c, STAFF);
    c.jar.delete(COOKIE_ACCESS);
    expect((await c.send('/admin/leads/')).status).toBe(401);
  });

  it('renews an expired access token with the refresh token and rotates the cookies', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const before = b.jar.get(COOKIE_ACCESS)!;
    auth.expireAccess(before);
    const r = await b.send('/admin/leads/');
    expect(r.status).toBe(200);
    expect(b.jar.get(COOKIE_ACCESS)).not.toBe(before);
    expect(auth.state.calls.refresh).toBe(1);
    expect((await b.send('/admin/leads/')).status).toBe(200);
  });

  it('keeps the session when Auth is only unreachable (503) and drops it when Auth says it is gone', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    auth.state.down = true;
    expect((await b.send('/admin/leads/')).status).toBe(503);
    expect(b.jar.size).toBe(3);
    auth.state.down = false;
    expect((await b.send('/admin/leads/')).status).toBe(200);
    auth.expireAccess(b.jar.get(COOKIE_ACCESS)!);
    b.setCookie(COOKIE_REFRESH, 'refresh-revoked');
    expect((await b.send('/admin/leads/')).status).toBe(401);
  });

  it('locks out a person deactivated while signed in (403 with a sign-out button) and lets them back when re-enabled', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    await db.exec(`update public.crm_staff set active = false where email = '${STAFF.email}'`);
    const r = await b.send('/admin/leads/');
    expect(r.status).toBe(403);
    expect(r.text).toContain('Không có quyền truy cập');
    expect(r.text).toContain('action="/admin/logout/"');
    await db.exec(`update public.crm_staff set active = true where email = '${STAFF.email}'`);
    expect((await b.send('/admin/leads/')).status).toBe(200);
  });

  it('answers 403 (not 401) to a signed-in Auth user who is not staff, and shows no lead data', async () => {
    await insertLead({ email: 'hidden.from.outsider@lead.test' });
    const b = newBrowser();
    // The Auth user holds a valid session (obtained out of band); the CRM must still refuse.
    const tokens = await auth.client.signIn(OUTSIDER.email, OUTSIDER.password);
    if (!tokens.ok) throw new Error('fixture');
    b.setCookie(COOKIE_ACCESS, tokens.tokens.accessToken);
    b.setCookie(COOKIE_REFRESH, tokens.tokens.refreshToken);
    b.setCookie(COOKIE_SESSION, await signSession(SECRET, now, now));
    for (const path of ['/admin/leads/', '/admin/staff/', '/admin/account/']) {
      const r = await b.send(path);
      expect(r.status, path).toBe(403);
      expect(r.text).not.toContain('hidden.from.outsider');
    }
    expect((await b.send('/admin/leads/00000000-0000-4000-8000-000000000001/status/', { form: { from: 'new', to: 'closed' } })).status).toBe(403);
  });
});

describe('roles and lead scope (IDOR)', () => {
  it('keeps staff management for administrators', async () => {
    const staff = newBrowser();
    await signIn(staff, STAFF);
    expect((await staff.send('/admin/staff/')).status).toBe(403);
    const attempt = await staff.send('/admin/staff/', { form: { action: 'upsert', email: 'new.admin@vbfa.test', role: 'admin', kind: ['membership', 'newsletter', 'contact'] } });
    expect(attempt.status).toBe(403);
    expect((await db.query('select 1 from public.crm_staff where email = $1', ['new.admin@vbfa.test'])).rows.length).toBe(0);
    expect((await staff.send('/admin/leads/')).text).not.toContain('Người dùng CRM</a>'); // no menu entry either
    const admin = newBrowser();
    await signIn(admin, ADMIN);
    expect((await admin.send('/admin/staff/')).status).toBe(200);
    expect((await admin.send('/admin/leads/')).text).toContain('Người dùng CRM</a>');
  });

  it('lets an administrator add, change and deactivate people, never the last administrator, with a flash and an audit entry', async () => {
    const admin = newBrowser();
    await signIn(admin, ADMIN);
    const added = await admin.send('/admin/staff/', { form: { action: 'upsert', email: ' Trainee@VBFA.test ', role: 'staff', kind: ['membership'] } });
    expect(added.location).toBe('/admin/staff/?done=upsert_created');
    expect((await admin.send(added.location!)).text).toContain('Đã cấp quyền');
    expect((await admin.send('/admin/staff/')).text).toContain('trainee@vbfa.test');
    expect((await db.query<{ kinds: string[] }>("select kinds from public.crm_staff where email = 'trainee@vbfa.test'")).rows[0]!.kinds).toEqual(['membership']);
    expect((await admin.send('/admin/staff/', { form: { action: 'deactivate', email: 'trainee@vbfa.test' } })).location).toBe('/admin/staff/?done=deactivated');
    expect((await admin.send('/admin/staff/', { form: { action: 'activate', email: 'trainee@vbfa.test' } })).location).toBe('/admin/staff/?done=activated');
    expect((await admin.send('/admin/staff/', { form: { action: 'deactivate', email: ADMIN.email } })).location).toBe('/admin/staff/?done=last_admin');
    expect((await admin.send('/admin/staff/', { form: { action: 'upsert', email: ADMIN.email, role: 'staff', kind: ['membership'] } })).location).toBe('/admin/staff/?done=last_admin');
    expect((await admin.send('/admin/staff/', { form: { action: 'upsert', email: 'bad', role: 'staff', kind: ['membership'] } })).location).toBe('/admin/staff/?done=bad_input');
    expect((await admin.send('/admin/staff/', { form: { action: 'upsert', email: 'ok@vbfa.test', role: 'owner', kind: ['membership'] } })).location).toBe('/admin/staff/?done=bad_input');
    expect((await admin.send('/admin/staff/', { form: { action: 'upsert', email: 'ok@vbfa.test', role: 'staff' } })).location).toBe('/admin/staff/?done=bad_input');
    expect((await audit('staff_upsert')).length).toBeGreaterThanOrEqual(1);
  });

  it('shows a newsletter-only person newsletter leads only, and answers 404 for everything else about a membership lead', async () => {
    const member = await insertLead({ name: 'Member Only Person', email: 'member.only@lead.test' });
    const subscriber = await insertLead({ kind: 'newsletter', name: null, company: null, email: 'subscriber.only@lead.test' });
    const b = newBrowser();
    await signIn(b, NEWS);
    const list = await b.send('/admin/leads/');
    expect(list.text).toContain('subscriber.only@lead.test');
    expect(list.text).not.toContain('member.only@lead.test');
    expect((await b.send('/admin/leads/?kind=membership')).text).not.toContain('member.only@lead.test');
    expect(list.text).not.toContain('value="membership"'); // the filter does not even offer it
    expect((await b.send(`/admin/leads/${member}/`)).status).toBe(404);
    expect((await b.send(`/admin/leads/${member}/status/`, { form: { from: 'new', to: 'closed' } })).status).toBe(404);
    expect((await b.send(`/admin/leads/${member}/note/`, { form: { body: 'sneaky' } })).status).toBe(404);
    expect(await status(member)).toBe('new');
    expect((await db.query('select 1 from public.lead_notes where lead_id = $1', [member])).rows.length).toBe(0);
    expect((await b.send(`/admin/leads/${subscriber}/`)).status).toBe(200);
  });

  it('answers 404 for malformed, unknown and erased lead ids alike', async () => {
    const erased = await insertLead({ email: 'erased@lead.test', status: 'deleted' });
    const b = newBrowser();
    await signIn(b, ADMIN);
    for (const id of ['not-a-uuid', '12345', '00000000-0000-4000-8000-0000000000aa', erased, "'; drop table x;--"]) expect((await b.send(`/admin/leads/${encodeURIComponent(id)}/`)).status, id).toBe(404);
    expect((await b.send(`/admin/leads/${erased}/note/`, { form: { body: 'x' } })).status).toBe(404);
  });
});

describe('Lead Inbox', () => {
  it('lists the newest first with filters, search and pagination; invalid filter values are ignored', async () => {
    await db.exec(`delete from public.website_leads`);
    for (let i = 0; i < 27; i++) await insertLead({ name: `Khách số ${String(i).padStart(2, '0')}`, email: `khach${String(i).padStart(2, '0')}@list.test`, created_at: new Date(Date.parse('2026-10-01T03:00:00Z') + i * 3_600_000).toISOString(), ...(i % 9 === 0 ? { status: 'contacted' } : {}) });
    await insertLead({ kind: 'newsletter', name: null, company: null, email: 'bantin@list.test', created_at: '2026-09-01T03:00:00Z' });
    const b = newBrowser();
    await signIn(b, STAFF);

    const first = (await b.send('/admin/leads/')).text;
    expect(first).toContain('Hiển thị 1–25 trong 28 kết quả.');
    expect(first.indexOf('khach26@list.test')).toBeGreaterThan(-1);
    expect(first.indexOf('khach26@list.test')).toBeLessThan(first.indexOf('khach25@list.test')); // newest first
    expect(first).not.toContain('bantin@list.test');
    expect(first).toContain('rel="next"');
    const second = (await b.send('/admin/leads/?page=2')).text;
    expect(second).toContain('Hiển thị 26–28 trong 28 kết quả.');
    expect(second).toContain('bantin@list.test');
    expect((await b.send('/admin/leads/?page=99')).location).toBe('/admin/leads/');

    expect((await b.send('/admin/leads/?kind=newsletter')).text).toContain('Hiển thị 1–1 trong 1 kết quả.');
    expect((await b.send('/admin/leads/?status=contacted')).text).toContain('trong 3 kết quả');
    expect((await b.send('/admin/leads/?q=KHÁCH SỐ 07')).text).toContain('khach07@list.test');
    expect((await b.send('/admin/leads/?q=khach07')).text).not.toContain('khach08@list.test');
    expect((await b.send('/admin/leads/?from=2026-09-01&to=2026-09-01')).text).toContain('bantin@list.test');
    expect((await b.send('/admin/leads/?q=zzz-no-match')).text).toContain('Không có khách nào khớp bộ lọc.');
    expect((await b.send('/admin/leads/?q=%25')).text).toContain('Không có khách nào khớp bộ lọc.'); // % is a literal, not a wildcard
    const ignored = (await b.send('/admin/leads/?kind=spam&status=deleted&from=garbage&to=2026-13-45&page=-4&q=')).text;
    expect(ignored).toContain('trong 28 kết quả');
    expect(ignored).toContain('Khách quan tâm');
  });

  it('renders every stored value as text: markup in a lead cannot become markup in the CRM', async () => {
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'';
    const id = await insertLead({ name: payload, company: payload, email: 'xss@lead.test', message: payload, interest: payload, source_path: '/p?x=<b>', utm: { utm_source: payload } });
    const b = newBrowser();
    await signIn(b, STAFF);
    await b.send(`/admin/leads/${id}/note/`, { form: { body: payload } });
    for (const path of ['/admin/leads/?q=xss@lead.test', `/admin/leads/${id}/`]) {
      const page = (await b.send(path)).text;
      expect(page).not.toContain('<script>alert');
      expect(page).not.toContain('<img src=x');
      expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }
  });

  it('shows the lead with consent source and time, and records who opened it', async () => {
    const id = await insertLead({ name: 'Lê Thị Chi', email: 'chi@lead.test', phone: '+84 90 000 0000', company: 'Công ty Chi', interest: 'Hội viên', message: 'Xin thông tin.\nCảm ơn.', consent_text_version: 'join-v2', consent_at: '2026-10-20T03:30:00Z', source_path: '/tin-tuc/', utm: { utm_source: 'fb' } });
    const b = newBrowser();
    await signIn(b, STAFF);
    const page = (await b.send(`/admin/leads/${id}/`)).text;
    for (const text of ['Lê Thị Chi', 'chi@lead.test', '+84 90 000 0000', 'Công ty Chi', 'Hội viên', 'Xin thông tin.\nCảm ơn.', 'join-v2', '/tin-tuc/', 'utm_source=fb', '10:30 20/10/2026', 'Thời điểm đồng ý']) expect(page, text).toContain(text);
    expect(page).not.toContain('ip_hash');
    expect((await audit('lead_view')).some((a) => a.lead_id === id && a.actor_email === STAFF.email)).toBe(true);
  });

  it('moves a lead New → In progress → Closed, shows the flash, and handles a stale form as a conflict', async () => {
    const id = await insertLead({ email: 'flow@lead.test' });
    const b = newBrowser();
    await signIn(b, STAFF);
    const other = newBrowser();
    await signIn(other, ADMIN);
    const page = (await b.send(`/admin/leads/${id}/`)).text;
    expect(page).toContain('name="to" value="contacted"');
    expect(page).not.toContain('name="to" value="new"'); // already there

    const step1 = await b.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'contacted' } });
    expect(step1.status).toBe(303);
    expect(step1.location).toBe(`/admin/leads/${id}/?done=status`);
    expect((await b.send(step1.location!)).text).toContain('Đã cập nhật trạng thái.');
    expect(await status(id)).toBe('contacted');
    // the admin still holds the form rendered when the lead was "new"
    const stale = await other.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'closed' } });
    expect(stale.location).toBe(`/admin/leads/${id}/?done=conflict`);
    expect((await other.send(stale.location!)).text).toContain('đã được người khác thay đổi');
    expect(await status(id)).toBe('contacted');
    expect((await other.send(`/admin/leads/${id}/status/`, { form: { from: 'contacted', to: 'closed' } })).location).toContain('done=status');
    expect(await status(id)).toBe('closed');
    expect((await audit('lead_status')).filter((a) => a.lead_id === id).map((a) => a.detail)).toEqual([{ from: 'new', to: 'contacted' }, { from: 'contacted', to: 'closed' }]);
  });

  it('rejects invalid statuses and leaves unsubscribed leads alone', async () => {
    const id = await insertLead({ email: 'bad.status@lead.test' });
    const unsub = await insertLead({ kind: 'newsletter', name: null, company: null, email: 'leaver@lead.test', status: 'unsubscribed' });
    const b = newBrowser();
    await signIn(b, STAFF);
    for (const to of ['deleted', 'unsubscribed', 'spam', '']) expect((await b.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to } })).status).toBe(400);
    expect((await b.send(`/admin/leads/${id}/status/`, { form: { from: 'garbage', to: 'closed' } })).status).toBe(400);
    expect(await status(id)).toBe('new');
    expect((await b.send(`/admin/leads/${unsub}/status/`, { form: { from: 'unsubscribed', to: 'contacted' } })).location).toContain('done=locked');
    expect(await status(unsub)).toBe('unsubscribed');
    expect((await b.send(`/admin/leads/${unsub}/`)).text).toContain('không thay đổi được từ CRM');
  });

  it('saves internal notes with the author and time, in order, preserving line breaks', async () => {
    const id = await insertLead({ email: 'notes@lead.test' });
    const b = newBrowser();
    await signIn(b, STAFF);
    const admin = newBrowser();
    await signIn(admin, ADMIN);
    expect((await b.send(`/admin/leads/${id}/note/`, { form: { body: '  Đã gọi lúc 9h.\nHẹn gặp thứ Sáu.  ' } })).location).toBe(`/admin/leads/${id}/?done=note`);
    now += 5 * 60_000;
    await admin.send(`/admin/leads/${id}/note/`, { form: { body: 'Đã gửi hồ sơ hội viên.' } });
    const page = (await b.send(`/admin/leads/${id}/`)).text;
    expect(page.indexOf('Đã gọi lúc 9h.')).toBeLessThan(page.indexOf('Đã gửi hồ sơ hội viên.'));
    expect(page).toContain('Đã gọi lúc 9h.\nHẹn gặp thứ Sáu.');
    expect(page).toContain(STAFF.email);
    expect(page).toContain(ADMIN.email);
    expect(page).toContain('<time datetime=');
    expect((await b.send(`/admin/leads/?q=notes@lead.test`)).text).toMatch(/<td class="col-opt">2<\/td>/);
  });

  it('validates notes (1 to 2000 characters)', async () => {
    const id = await insertLead({ email: 'notes.invalid@lead.test' });
    const b = newBrowser();
    await signIn(b, STAFF);
    for (const body of ['', '   \n ', 'x'.repeat(2001)]) expect((await b.send(`/admin/leads/${id}/note/`, { form: { body } })).location).toBe(`/admin/leads/${id}/?done=note_invalid`);
    expect((await b.send(`/admin/leads/${id}/note/`, { form: { body: 'ế'.repeat(2000) } })).location).toContain('done=note');
    expect((await db.query('select 1 from public.lead_notes where lead_id = $1', [id])).rows.length).toBe(1);
  });

  it('keeps an audit trail of sign-in, views, status changes, notes, staff changes and sign-out', async () => {
    const id = await insertLead({ email: 'trail@lead.test' });
    const b = newBrowser();
    await signIn(b, ADMIN);
    await b.send(`/admin/leads/${id}/`);
    await b.send(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'contacted' } });
    await b.send(`/admin/leads/${id}/note/`, { form: { body: 'ghi chú kiểm thử audit' } });
    await b.send('/admin/staff/', { form: { action: 'upsert', email: 'audit.target@vbfa.test', role: 'staff', kind: ['contact'] } });
    await b.send('/admin/logout/', { form: {} });
    for (const action of ['login', 'lead_view', 'lead_status', 'lead_note', 'staff_upsert', 'logout']) expect((await audit(action)).length, action).toBeGreaterThan(0);
    const all = JSON.stringify((await db.query('select action, detail, actor_email from public.crm_audit_log')).rows);
    for (const secret of ['ghi chú kiểm thử audit', 'trail@lead.test', 'Nguyễn Văn A']) expect(all).not.toContain(secret);
  });
});

describe('account', () => {
  it('changes the password after re-checking the current one', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const next = 'A-much-longer-passphrase-2026';
    const current = STAFF.password;
    const bad = [
      [{ current: 'wrong', next, confirm: next }, 'không đúng'],
      [{ current: STAFF.password, next: 'short', confirm: 'short' }, 'ít nhất 12 ký tự'],
      [{ current, next, confirm: 'different-different' }, 'không khớp'],
      [{ current: STAFF.password, next: STAFF.password, confirm: STAFF.password }, 'phải khác'],
    ] as const;
    for (const [form, message] of bad) {
      const r = await b.send('/admin/account/', { form: form as Record<string, string> });
      expect(r.status).toBe(400);
      expect(r.text).toContain(message);
    }
    expect(auth.password(STAFF.email)).toBe(STAFF.password);
    const ok = await b.send('/admin/account/', { form: { current: STAFF.password, next, confirm: next } });
    expect(ok.location).toBe('/admin/account/?done=password');
    expect(auth.password(STAFF.email)).toBe(next);
    expect((await b.send(ok.location!)).text).toContain('Đã đổi mật khẩu.');
    expect(auth.activeSessions()).toBe(1); // the proof-of-password session was revoked, the real one stays
  });
});

describe('response hygiene', () => {
  it('never lets a CRM page be cached, indexed, framed or script-driven', async () => {
    await db.exec('delete from public.website_leads'); // earlier tests store markup-looking text on purpose; here the page must be clean
    const id = await insertLead({ email: 'headers@lead.test' });
    const b = newBrowser();
    const replies = [await b.send('/admin/login/'), await b.send('/admin/leads/'), await b.send('/admin/nope/')];
    await signIn(b, ADMIN);
    replies.push(...(await Promise.all(['/admin/leads/', `/admin/leads/${id}/`, '/admin/staff/', '/admin/account/'].map((p) => b.send(p)))));
    replies.push(await signIn(newBrowser(), STAFF), await b.send('/admin/logout/', { form: {} }));
    for (const r of replies) {
      expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0');
      expect(r.headers.get('x-robots-tag')).toContain('noindex');
      expect(r.headers.get('x-frame-options')).toBe('DENY');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('referrer-policy')).toBe('no-referrer');
      const csp = r.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("default-src 'none'");
      expect(csp).not.toMatch(/script-src|unsafe-inline|unsafe-eval|\*/);
      expect(csp).toContain("frame-ancestors 'none'");
      if (r.status !== 303) {
        expect(r.headers.get('content-type')).toContain('text/html');
        expect(r.text).toContain('name="robots" content="noindex');
        expect(r.text).not.toMatch(/<script|<style|\sstyle=|\son[a-z]+=|javascript:/i);
        expect(r.text).toContain('<link rel="stylesheet" href="/admin/crm.css">');
      }
    }
  });

  it('serves HEAD without a body', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const r = await b.send('/admin/leads/', { method: 'HEAD' });
    expect(r.status).toBe(200);
    expect(r.text).toBe('');
  });

  it('logs the route, status, role and duration only: no e-mail, name, note, token or address', async () => {
    const id = await insertLead({ name: 'Tên Rất Riêng Tư', email: 'private.person@lead.test' });
    const b = newBrowser();
    await signIn(b, STAFF);
    await b.send('/admin/leads/?q=private.person');
    await b.send(`/admin/leads/${id}/`);
    await b.send(`/admin/leads/${id}/note/`, { form: { body: 'Ghi chú riêng tư không được lộ' } });
    await newBrowser().send('/admin/login/', { form: { email: 'attacker@evil.test', password: 'hunter2-hunter2' }, ip: '203.0.113.200' });
    const text = logs.lines.join('\n');
    expect(logs.lines.length).toBeGreaterThan(4);
    for (const secret of ['private.person', 'Tên Rất Riêng Tư', 'Ghi chú riêng tư', 'attacker@evil', 'hunter2', STAFF.email, STAFF.password, '203.0.113.', 'access-', 'refresh-', 'service-role-secret']) expect(text, secret).not.toContain(secret);
    for (const line of logs.lines) expect(Object.keys(JSON.parse(line)).every((k) => ['level', 'event', 'requestId', 'ts', 'route', 'status', 'role', 'durationMs', 'reason', 'result', 'error'].includes(k)), line).toBe(true);
  });

  it('turns a database failure into a 503 page without leaking the cause', async () => {
    const b = newBrowser();
    await signIn(b, STAFF);
    const broken: CrmDeps = { ...deps(), store: { ...pgliteStore(db), listLeads: async () => { throw new Error('connection to db.internal:5432 refused password=hunter2'); } } };
    const request = new Request(`${ORIGIN}/admin/leads/`, { headers: { cookie: [...b.jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ') } });
    const r = await handleCrm(request, '203.0.113.9', broken);
    expect(r.status).toBe(503);
    const text = await r.text();
    expect(text).not.toMatch(/db\.internal|hunter2|5432/);
    expect(logs.lines.join('\n')).not.toContain('hunter2');
  });
});
