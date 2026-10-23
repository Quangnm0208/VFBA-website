import { hashIp } from '../hash';
import type { Logger } from '../log';
import type { Safe } from './html';
import type { AuthClient, AuthUser } from './auth';
import { ABSOLUTE_MS, clearAll, COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_SESSION, parseCookies, setCookie, signSession, verifySession } from './session';
import { BadInputError, ForbiddenError, LEAD_KINDS, LEAD_STATUSES, WORKFLOW_STATUSES, type CrmStore, type LeadKind, type LeadStatus, type Role, type StaffIdentity, type WorkflowStatus } from './store';
import { accountPage, deniedPage, errorPage, leadPage, leadsPage, leadsQuery, loginPage, PAGE_SIZE, staffPage, type Flash } from './views';

/**
 * The CRM Lead Inbox: one request handler for everything under /admin/ (server-rendered HTML, no client script).
 *
 * Security model
 *  - Identity: a Supabase Auth session, verified with Supabase on EVERY request (access token, refresh when it expired).
 *  - Authorization: the verified user id must be an active, bound row of `crm_staff` (admin-controlled role and lead scope).
 *    The database functions re-check it, so a bug here cannot widen access.
 *  - Sessions: HttpOnly Secure SameSite=Strict cookies scoped to /admin, idle timeout 30 min, absolute lifetime 8 h.
 *  - State changes are POST only and require a same-origin request (Origin and Fetch Metadata) on top of SameSite=Strict.
 *  - Throttle: sign-in attempts are counted per address and per (e-mail, address) pair, so a stranger cannot lock a person out.
 *  - Every response is `private, no-store`, `noindex`, framed by nobody and has a CSP without any script.
 *  - Logs carry the route, status, role and duration only: never e-mails, names or lead data.
 */
export interface CrmDeps {
  store: CrmStore;
  auth: AuthClient;
  log: Logger;
  /** Root secret for the session clock cookie (the service-role key; HMAC-derived, never used as is). */
  sessionSecret: string;
  /** Salt for the sign-in throttle hashes (same secret as the form rate limit). */
  ipSalt: string;
  now?: () => number;
}

/** A 2000-character Vietnamese note is up to 18 KB once percent-encoded (9 characters per letter with diacritics). */
const MAX_BODY = 32 * 1024;
const UNKNOWN_ADDRESS = 'unknown-address';
const GENERIC_LOGIN_ERROR = 'Email hoặc mật khẩu không đúng, hoặc tài khoản chưa được cấp quyền CRM.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECURITY_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  // Not 'no-referrer': with it browsers send `Origin: null` on same-origin form posts and the CSRF check would refuse every one.
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  Vary: 'Cookie',
};

export function respond(status: number, body: Safe | string | null, extra: Record<string, string> = {}, cookies: string[] = []): Response {
  const headers = new Headers({ ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', ...extra });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(body === null ? null : String(body), { status, headers });
}
const redirect = (location: string, cookies: string[] = []) => respond(303, null, { Location: location }, cookies);

/** Only paths inside /admin/ may be a post-login target (no open redirect). */
export function safeNext(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 300) return undefined;
  if (!/^\/admin\/[A-Za-z0-9/_\-.?=&%:+]*$/.test(value) || value.includes('//')) return undefined;
  if (value.startsWith('/admin/login/') || value.startsWith('/admin/logout/')) return undefined;
  return value;
}

/** Same-origin only: the CRM has no cross-origin client, so no extra origin (unlike the public forms) is ever accepted. */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** PostgreSQL text cannot hold NUL: drop it instead of turning a pasted character into a 503. */
const clean = (value: string) => value.replace(/\u0000/g, '');

const validDate = (value: string | null): string | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
};

type Auth =
  | { state: 'anon'; clear: boolean }
  | { state: 'unavailable' }
  | { state: 'denied'; email: string }
  | { state: 'ok'; staff: StaffIdentity; userId: string; accessToken: string; cookies: string[] };

type Handler = (ctx: Ctx) => Promise<Response>;
interface Ctx {
  request: Request;
  url: URL;
  form: URLSearchParams;
  staff: StaffIdentity;
  userId: string;
  accessToken: string;
  cookies: string[];
  id?: string;
  deps: CrmDeps;
  clientIp?: string;
}

const FLASH: Record<string, Flash> = {
  status: { tone: 'ok', text: 'Đã cập nhật trạng thái.' },
  noop: { tone: 'ok', text: 'Trạng thái không thay đổi.' },
  conflict: { tone: 'error', text: 'Trạng thái đã được người khác thay đổi trước đó. Trang đã được tải lại với trạng thái mới nhất.' },
  locked: { tone: 'error', text: 'Khách đã huỷ đăng ký: không thay đổi trạng thái từ CRM.' },
  note: { tone: 'ok', text: 'Đã lưu ghi chú.' },
  note_invalid: { tone: 'error', text: 'Ghi chú phải có từ 1 đến 2000 ký tự.' },
  upsert_created: { tone: 'ok', text: 'Đã cấp quyền. Người này đăng nhập bằng tài khoản Supabase Auth đã được mời.' },
  upsert_updated: { tone: 'ok', text: 'Đã cập nhật vai trò và phạm vi.' },
  activated: { tone: 'ok', text: 'Đã kích hoạt lại.' },
  deactivated: { tone: 'ok', text: 'Đã vô hiệu hoá: người này bị đăng xuất khỏi CRM ngay ở lần thao tác tiếp theo.' },
  last_admin: { tone: 'error', text: 'Không thể bỏ quyền hoặc vô hiệu hoá quản trị viên cuối cùng.' },
  not_found: { tone: 'error', text: 'Không tìm thấy người dùng này.' },
  bad_input: { tone: 'error', text: 'Dữ liệu không hợp lệ. Kiểm tra email, vai trò và phạm vi.' },
  password: { tone: 'ok', text: 'Đã đổi mật khẩu.' },
  out: { tone: 'ok', text: 'Bạn đã đăng xuất.' },
};

export async function handleCrm(request: Request, clientIp: string | undefined, deps: CrmDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const started = now();
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const segments = url.pathname.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
  let route = 'unknown';
  let role: Role | undefined;
  // Cookies a successful authentication wants to set (rotated tokens, the sliding clock). Kept for error pages too, so a
  // refresh that already happened is not lost when a later step fails.
  let carried: string[] = [];

  const done = (response: Response, event = 'crm.request', extra: Record<string, string | number | boolean> = {}) => {
    deps.log[response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info'](event, { route, status: response.status, role, durationMs: now() - started, ...extra });
    return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  };

  try {
    if (!url.pathname.startsWith('/admin/') && url.pathname !== '/admin') return done(respond(404, errorPage('Không tìm thấy trang', 'Đường dẫn này không tồn tại.')), 'crm.not_found');
    if (url.pathname === '/admin') return done(redirect('/admin/'), 'crm.redirect');

    const [head, second, third] = segments;
    let handler: Handler | undefined;
    let needsAuth = true;
    let adminOnly = false;
    let allowed: string[] = ['GET', 'HEAD'];

    if (!head) {
      route = 'home';
      handler = async (c) => redirect('/admin/leads/', c.cookies);
    } else if (head === 'login' && !second) {
      route = 'login';
      needsAuth = false;
      allowed = ['GET', 'HEAD', 'POST'];
    } else if (head === 'logout' && !second) {
      route = 'logout';
      needsAuth = false;
      allowed = ['POST'];
    } else if (head === 'leads' && !second) {
      route = 'leads';
      handler = listLeads;
    } else if (head === 'leads' && second && !third) {
      route = 'lead';
      handler = showLead;
    } else if (head === 'leads' && second && third === 'status' && segments.length === 3) {
      route = 'lead.status';
      handler = changeStatus;
      allowed = ['POST'];
    } else if (head === 'leads' && second && third === 'note' && segments.length === 3) {
      route = 'lead.note';
      handler = addNote;
      allowed = ['POST'];
    } else if (head === 'staff' && !second) {
      route = 'staff';
      handler = staffAdmin;
      adminOnly = true;
      allowed = ['GET', 'HEAD', 'POST'];
    } else if (head === 'account' && !second) {
      route = 'account';
      handler = account;
      allowed = ['GET', 'HEAD', 'POST'];
    } else {
      return done(respond(404, errorPage('Không tìm thấy trang', 'Đường dẫn này không tồn tại.')), 'crm.not_found');
    }

    if (!allowed.includes(method)) return done(respond(405, errorPage('Phương thức không được hỗ trợ', 'Thao tác này không được phép.'), { Allow: allowed.filter((m) => m !== 'HEAD').join(', ') }), 'crm.method');

    // State changes: same-origin form posts only.
    let form = new URLSearchParams();
    if (method === 'POST') {
      const site = request.headers.get('sec-fetch-site');
      if (!originAllowed(request) || (site && site !== 'same-origin')) return done(respond(403, errorPage('Yêu cầu bị từ chối', 'Nguồn yêu cầu không hợp lệ.')), 'crm.origin_rejected');
      if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) return done(respond(415, errorPage('Yêu cầu bị từ chối', 'Định dạng dữ liệu không hợp lệ.')), 'crm.bad_type');
      if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return done(respond(413, errorPage('Yêu cầu bị từ chối', 'Nội dung gửi quá lớn.')), 'crm.too_large');
      const text = await request.text();
      if (text.length > MAX_BODY) return done(respond(413, errorPage('Yêu cầu bị từ chối', 'Nội dung gửi quá lớn.')), 'crm.too_large');
      form = new URLSearchParams(text);
    }

    if (route === 'login') return done(await (method === 'POST' ? signIn(form, clientIp, deps) : loginScreen(request, url, deps)), method === 'POST' ? 'crm.login' : 'crm.page');
    if (route === 'logout') return done(await signOut(request, deps), 'crm.logout');

    const auth = await authenticate(request, deps);
    if (auth.state === 'unavailable') return done(respond(503, errorPage('Tạm thời không khả dụng', 'Không kết nối được dịch vụ đăng nhập. Vui lòng thử lại sau ít phút.')), 'crm.auth_unavailable');
    if (auth.state === 'anon') {
      const next = safeNext(`${url.pathname}${url.search}`);
      return done(respond(401, loginPage({ next }), {}, auth.clear ? clearAll() : []), 'crm.unauthorized');
    }
    if (auth.state === 'denied') return done(respond(403, deniedPage(auth.email)), 'crm.denied');

    role = auth.staff.role;
    carried = auth.cookies;
    if (adminOnly && auth.staff.role !== 'admin') return done(respond(403, errorPage('Không có quyền', 'Chỉ quản trị viên được dùng mục này.', auth.staff), {}, auth.cookies), 'crm.forbidden');
    if (!needsAuth || !handler) return done(respond(404, errorPage('Không tìm thấy trang', 'Đường dẫn này không tồn tại.', auth.staff), {}, auth.cookies), 'crm.not_found');

    const id = route.startsWith('lead') ? second : undefined;
    if (id !== undefined && !UUID.test(id)) return done(respond(404, errorPage('Không tìm thấy khách', 'Khách này không tồn tại hoặc bạn không có quyền xem.', auth.staff), {}, auth.cookies), 'crm.not_found');

    const response = await handler({ request, url, form, staff: auth.staff, userId: auth.userId, accessToken: auth.accessToken, cookies: auth.cookies, id: id?.toLowerCase(), deps, clientIp });
    return done(response);
  } catch (error) {
    if (error instanceof ForbiddenError) return done(respond(403, errorPage('Không có quyền', 'Tài khoản của bạn không có quyền thực hiện thao tác này.'), {}, carried), 'crm.forbidden');
    if (error instanceof BadInputError) return done(respond(400, errorPage('Dữ liệu không hợp lệ', 'Vui lòng kiểm tra lại thông tin đã nhập.'), {}, carried), 'crm.bad_input');
    return done(respond(503, errorPage('Tạm thời không khả dụng', 'Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại sau ít phút.'), {}, carried), 'crm.error', { error: safeErrorLabel(error) });
  }
}

/** Our own store errors are `crm.<function>:<code>`; anything else (network, library) is reduced to its class so no host, URL or value reaches the logs. */
function safeErrorLabel(error: unknown): string {
  if (error instanceof Error && /^crm\.[a-z_]+:[A-Za-z0-9_]+$/.test(error.message)) return error.message;
  return error instanceof Error ? error.name : 'unknown';
}

/* ───────────────────────── session ───────────────────────── */

/**
 * Revokes the Supabase session behind a pair of cookies, even when the access token has already expired (a refresh gives a live
 * one to sign out). Returns the user it belonged to, when known. Never throws: the cookies are cleared either way.
 */
async function revokeSession(deps: CrmDeps, access?: string, refresh?: string): Promise<AuthUser | undefined> {
  try {
    if (access) {
      const who = await deps.auth.getUser(access);
      if (who.ok) {
        await deps.auth.signOut(access);
        return who.user;
      }
    }
    if (refresh) {
      const renewed = await deps.auth.refresh(refresh);
      if (renewed.ok) {
        await deps.auth.signOut(renewed.tokens.accessToken);
        return renewed.tokens.user;
      }
    }
  } catch {
    /* best effort */
  }
  return undefined;
}

async function authenticate(request: Request, deps: CrmDeps): Promise<Auth> {
  const now = (deps.now ?? Date.now)();
  const cookies = parseCookies(request.headers.get('cookie'));
  const access = cookies[COOKIE_ACCESS];
  const refresh = cookies[COOKIE_REFRESH];
  const session = cookies[COOKIE_SESSION];
  if (!access && !refresh && !session) return { state: 'anon', clear: false };

  const clock = await verifySession(deps.sessionSecret, session, now);
  if (!clock.ok || !access || !refresh) {
    // A timed-out session is also ended at Supabase, so the refresh token left in the cookie jar cannot be used elsewhere.
    if (!clock.ok && (clock.reason === 'idle' || clock.reason === 'absolute')) await revokeSession(deps, access, refresh);
    return { state: 'anon', clear: true };
  }

  const remaining = Math.max(60, Math.floor((clock.started + ABSOLUTE_MS - now) / 1000));
  let accessToken = access;
  let rotated: string[] = [];
  let user: AuthUser | undefined;

  const checked = await deps.auth.getUser(access);
  if (checked.ok) user = checked.user;
  else if (checked.reason === 'unavailable') return { state: 'unavailable' };
  else {
    const renewed = await deps.auth.refresh(refresh);
    if (!renewed.ok) return renewed.reason === 'unavailable' ? { state: 'unavailable' } : { state: 'anon', clear: true };
    user = renewed.tokens.user;
    accessToken = renewed.tokens.accessToken;
    rotated = [setCookie(COOKIE_ACCESS, renewed.tokens.accessToken, remaining), setCookie(COOKIE_REFRESH, renewed.tokens.refreshToken, remaining)];
  }
  if (!user.confirmed) return { state: 'anon', clear: true };
  // The clock was issued for one person; tokens that belong to somebody else are not accepted with it.
  if (clock.userId !== user.id) {
    await deps.auth.signOut(accessToken);
    return { state: 'anon', clear: true };
  }

  const staff = await deps.store.whoami(user.id);
  // Not on the allowlist (or deactivated): refused on every request without writing to the audit trail each time; the sign-in
  // refusal and the deactivation itself are already recorded.
  if (!staff) return { state: 'denied', email: user.email };
  const slide = setCookie(COOKIE_SESSION, await signSession(deps.sessionSecret, clock.started, now, user.id), remaining);
  return { state: 'ok', staff, userId: user.id, accessToken, cookies: [...rotated, slide] };
}

async function loginScreen(request: Request, url: URL, deps: CrmDeps): Promise<Response> {
  const auth = await authenticate(request, deps);
  if (auth.state === 'ok') return redirect('/admin/leads/', auth.cookies);
  const notice = url.searchParams.get('done') === 'out' ? FLASH.out?.text : undefined;
  return respond(200, loginPage({ notice, next: safeNext(url.searchParams.get('next')) }), {}, auth.state === 'anon' && auth.clear ? clearAll() : []);
}

async function signIn(form: URLSearchParams, clientIp: string | undefined, deps: CrmDeps): Promise<Response> {
  const now = (deps.now ?? Date.now)();
  const email = clean(form.get('email') ?? '').trim().toLowerCase().slice(0, 254);
  const password = (form.get('password') ?? '').slice(0, 200);
  const next = safeNext(form.get('next'));
  const fail = (status: number, error: string, extra: Record<string, string> = {}) => respond(status, loginPage({ error, next, email }), extra, clearAll());
  if (!email || !password) return fail(400, 'Nhập email và mật khẩu.');

  const verdict = await deps.store.loginThrottle(await hashIp(clientIp ?? UNKNOWN_ADDRESS, deps.ipSalt), await hashIp(`crm-login:${email}|${clientIp ?? UNKNOWN_ADDRESS}`, deps.ipSalt));
  if (verdict !== 'ok') {
    deps.log.warn('crm.login_throttled', { reason: verdict });
    return fail(429, 'Bạn thử đăng nhập quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.', { 'Retry-After': '60' });
  }

  const result = await deps.auth.signIn(email, password);
  if (!result.ok) {
    if (result.reason === 'unavailable') return fail(503, 'Không kết nối được dịch vụ đăng nhập. Vui lòng thử lại sau ít phút.');
    deps.log.warn('crm.login_failed', { reason: 'credentials' });
    return fail(401, GENERIC_LOGIN_ERROR);
  }
  const { tokens } = result;
  if (!tokens.user.confirmed) {
    await deps.auth.signOut(tokens.accessToken);
    return fail(401, GENERIC_LOGIN_ERROR);
  }
  // Allowlist + first-use binding. A valid Auth user who is not on the list gets exactly the same answer as a wrong password.
  const staff = await deps.store.login(tokens.user.id, tokens.user.email);
  if (!staff) {
    await deps.store.recordEvent(tokens.user.id, tokens.user.email, 'denied').catch(() => undefined);
    await deps.auth.signOut(tokens.accessToken);
    deps.log.warn('crm.login_failed', { reason: 'not_staff' });
    return fail(401, GENERIC_LOGIN_ERROR);
  }

  const maxAge = Math.floor(ABSOLUTE_MS / 1000);
  deps.log.info('crm.login_ok', { role: staff.role });
  return redirect(next ?? '/admin/leads/', [
    setCookie(COOKIE_ACCESS, tokens.accessToken, maxAge),
    setCookie(COOKIE_REFRESH, tokens.refreshToken, maxAge),
    setCookie(COOKIE_SESSION, await signSession(deps.sessionSecret, now, now, tokens.user.id), maxAge),
  ]);
}

async function signOut(request: Request, deps: CrmDeps): Promise<Response> {
  const cookies = parseCookies(request.headers.get('cookie'));
  // Revokes the session at Supabase (also when the access token already expired), so a copied cookie stops working too.
  const who = await revokeSession(deps, cookies[COOKIE_ACCESS] || undefined, cookies[COOKIE_REFRESH] || undefined);
  if (who) await deps.store.recordEvent(who.id, who.email, 'logout').catch(() => undefined);
  return redirect('/admin/login/?done=out', clearAll());
}

/* ───────────────────────── Lead Inbox ───────────────────────── */

async function listLeads(c: Ctx): Promise<Response> {
  const q = c.url.searchParams;
  const kind = LEAD_KINDS.find((k) => k === q.get('kind'));
  const status = LEAD_STATUSES.find((s) => s === q.get('status') && s !== 'deleted');
  const from = validDate(q.get('from'));
  const to = validDate(q.get('to'));
  const text = clean(q.get('q') ?? '').trim().slice(0, 100) || undefined;
  const page = Math.min(10_000, Math.max(1, Math.floor(Number(q.get('page'))) || 1));
  const filter = { kind: kind as LeadKind | undefined, status: status as LeadStatus | undefined, from, to, q: text };

  const { rows, total } = await c.deps.store.listLeads(c.userId, { ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  if (rows.length === 0 && page > 1) return redirect(`/admin/leads/${leadsQuery(filter, 1)}`, c.cookies);
  return respond(200, leadsPage({ staff: c.staff, rows, total, page, filter }), {}, c.cookies);
}

async function showLead(c: Ctx): Promise<Response> {
  const detail = await c.deps.store.getLead(c.userId, c.id!);
  // Not found, erased and outside the person's scope look the same.
  if (!detail) return respond(404, errorPage('Không tìm thấy khách', 'Khách này không tồn tại hoặc bạn không có quyền xem.', c.staff), {}, c.cookies);
  return respond(200, leadPage(c.staff, detail, FLASH[c.url.searchParams.get('done') ?? '']), {}, c.cookies);
}

async function changeStatus(c: Ctx): Promise<Response> {
  const to = WORKFLOW_STATUSES.find((s) => s === c.form.get('to')) as WorkflowStatus | undefined;
  const from = LEAD_STATUSES.find((s) => s === c.form.get('from'));
  if (!to || !from) return respond(400, errorPage('Dữ liệu không hợp lệ', 'Trạng thái không hợp lệ.', c.staff), {}, c.cookies);
  const result = await c.deps.store.setStatus(c.userId, c.id!, from, to);
  if (result === 'not_found') return respond(404, errorPage('Không tìm thấy khách', 'Khách này không tồn tại hoặc bạn không có quyền sửa.', c.staff), {}, c.cookies);
  c.deps.log.info('crm.status', { role: c.staff.role, result });
  return redirect(`/admin/leads/${c.id}/?done=${result === 'ok' ? 'status' : result}`, c.cookies);
}

async function addNote(c: Ctx): Promise<Response> {
  const body = clean(c.form.get('body') ?? '').trim();
  const length = Array.from(body).length;
  if (length < 1 || length > 2000) return redirect(`/admin/leads/${c.id}/?done=note_invalid`, c.cookies);
  const result = await c.deps.store.addNote(c.userId, c.id!, body);
  if (result === 'not_found') return respond(404, errorPage('Không tìm thấy khách', 'Khách này không tồn tại hoặc bạn không có quyền sửa.', c.staff), {}, c.cookies);
  c.deps.log.info('crm.note', { role: c.staff.role });
  return redirect(`/admin/leads/${c.id}/?done=note`, c.cookies);
}

/* ───────────────────────── staff (admin) and account ───────────────────────── */

async function staffAdmin(c: Ctx): Promise<Response> {
  if (c.request.method === 'POST') {
    const action = c.form.get('action');
    const email = clean(c.form.get('email') ?? '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect('/admin/staff/?done=bad_input', c.cookies);

    if (action === 'upsert') {
      const roleValue = c.form.get('role');
      const kinds = LEAD_KINDS.filter((k) => c.form.getAll('kind').includes(k));
      if ((roleValue !== 'admin' && roleValue !== 'staff') || kinds.length === 0) return redirect('/admin/staff/?done=bad_input', c.cookies);
      const result = await c.deps.store.staffUpsert(c.userId, email, roleValue, kinds, c.form.get('reset') === '1');
      return redirect(`/admin/staff/?done=${result === 'created' ? 'upsert_created' : result === 'updated' ? 'upsert_updated' : 'last_admin'}`, c.cookies);
    }
    if (action === 'activate' || action === 'deactivate') {
      const result = await c.deps.store.staffSetActive(c.userId, email, action === 'activate');
      return redirect(`/admin/staff/?done=${result === 'ok' ? (action === 'activate' ? 'activated' : 'deactivated') : result}`, c.cookies);
    }
    return redirect('/admin/staff/?done=bad_input', c.cookies);
  }
  const rows = await c.deps.store.staffList(c.userId);
  return respond(200, staffPage(c.staff, rows, FLASH[c.url.searchParams.get('done') ?? '']), {}, c.cookies);
}

async function account(c: Ctx): Promise<Response> {
  if (c.request.method !== 'POST') return respond(200, accountPage(c.staff, c.url.searchParams.get('done') === 'password' ? FLASH.password : undefined), {}, c.cookies);

  const current = c.form.get('current') ?? '';
  const next = c.form.get('next') ?? '';
  const confirm = c.form.get('confirm') ?? '';
  const problem = (status: number, text: string) => respond(status, accountPage(c.staff, { tone: 'error', text }), {}, c.cookies);
  if (Array.from(next).length < 12) return problem(400, 'Mật khẩu mới cần ít nhất 12 ký tự.');
  if (next.length > 200) return problem(400, 'Mật khẩu mới quá dài.');
  if (next !== confirm) return problem(400, 'Hai lần nhập mật khẩu mới không khớp.');
  if (next === current) return problem(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');

  // Re-authenticate with the current password (throttled like a sign-in), then change it with the live session.
  const verdict = await c.deps.store.loginThrottle(await hashIp(c.clientIp ?? UNKNOWN_ADDRESS, c.deps.ipSalt), await hashIp(`crm-login:${c.staff.email}|${c.clientIp ?? UNKNOWN_ADDRESS}`, c.deps.ipSalt));
  if (verdict !== 'ok') return problem(429, 'Bạn thử quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.');
  const proof = await c.deps.auth.signIn(c.staff.email, current.slice(0, 200));
  if (!proof.ok) return problem(proof.reason === 'unavailable' ? 503 : 400, proof.reason === 'unavailable' ? 'Không kết nối được dịch vụ đăng nhập. Thử lại sau.' : 'Mật khẩu hiện tại không đúng.');
  await c.deps.auth.signOut(proof.tokens.accessToken);

  const result = await c.deps.auth.updatePassword(c.accessToken, next);
  if (result === 'ok') {
    // A changed password ends every other session of this person (a stolen one included).
    await c.deps.auth.signOutOthers(c.accessToken);
    c.deps.log.info('crm.password_changed', { role: c.staff.role });
    return redirect('/admin/account/?done=password', c.cookies);
  }
  if (result === 'unavailable') return problem(503, 'Không kết nối được dịch vụ đăng nhập. Thử lại sau.');
  if (result === 'same') return problem(400, 'Mật khẩu mới phải khác mật khẩu hiện tại.');
  if (result === 'invalid') return problem(401, 'Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.');
  return problem(400, 'Mật khẩu mới chưa đủ mạnh. Dùng cụm từ dài hơn, không dùng mật khẩu phổ biến.');
}
