import { fieldErrors, joinSchema, newsletterSchema, type JoinInput, type LeadKind, type NewsletterInput } from './validation';
import { hashIp } from './hash';
import { verifyTurnstile } from './turnstile';
import type { LeadRecord, LeadStore, Limits } from './store';
import type { Logger } from './log';

const MAX_BODY = 8 * 1024;
const MIN_FILL_MS = 2000;
/** Per visitor address and 10-minute window: at most 15 requests that passed validation, and at most 5 stored leads. */
export const LIMITS: Limits = { windowSeconds: 10 * 60, maxAttempts: 15, maxLeads: 5 };
/** Bucket for requests whose address cannot be determined: they share one budget instead of escaping the limit. */
const UNKNOWN_ADDRESS = 'unknown-address';

export interface LeadDeps {
  /** null when collection is not enabled or Supabase is not configured: the route then fails closed (503). */
  store: LeadStore | null;
  log: Logger;
  now?: () => number;
  /** Exact origins allowed to post (the request's own origin is always allowed). */
  allowedOrigins?: string[];
  turnstileSecret?: string;
  /** Secret used to hash IP addresses for rate limiting. Required: without it the route fails closed (503). */
  ipSalt?: string;
  fetchImpl?: typeof fetch;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) => reply(status, { ok: false, code, message, ...extra });

export const MESSAGES = {
  forbidden: 'Nguồn yêu cầu không hợp lệ.',
  tooLarge: 'Nội dung gửi quá lớn.',
  badType: 'Định dạng dữ liệu không hợp lệ.',
  badJson: 'Dữ liệu gửi lên không đọc được.',
  rateLimited: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  unavailable: 'Biểu mẫu tạm thời chưa nhận được thông tin. Vui lòng thử lại sau.',
  captcha: 'Chưa xác minh được yêu cầu. Vui lòng thử lại.',
  tooFast: 'Bạn gửi quá nhanh. Vui lòng kiểm tra lại thông tin và gửi lại sau vài giây.',
} as const;

function originAllowed(request: Request, allowed: string[]): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const value = new URL(origin).origin;
    return value === new URL(request.url).origin || allowed.includes(value);
  } catch {
    return false;
  }
}

/**
 * Shared flow for /api/join and /api/newsletter.
 * Order matters: cheap checks first (method/origin/size/shape), honeypot hits dropped silently (no signal to adapt to),
 * an instant submit answered with an honest retry (never a false "saved"), then validation, configuration, rate limit (counts every attempt, stored or not), captcha, storage.
 */
export async function handleLead(request: Request, kind: LeadKind, clientIp: string | undefined, deps: LeadDeps): Promise<Response> {
  const { log, store } = deps;
  const now = deps.now ?? Date.now;
  const started = now();
  const done = (response: Response, event: string, extra: Record<string, string | number | boolean> = {}) => {
    log[response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info'](event, { kind, status: response.status, durationMs: now() - started, ...extra });
    return response;
  };

  if (request.method !== 'POST') return done(reply(405, { ok: false, code: 'method', message: 'Phương thức không được hỗ trợ.' }, { Allow: 'POST' }), 'lead.method');
  if (!originAllowed(request, deps.allowedOrigins ?? [])) return done(fail(403, 'forbidden', MESSAGES.forbidden), 'lead.origin_rejected');
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return done(fail(415, 'type', MESSAGES.badType), 'lead.bad_type');
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return done(fail(413, 'too_large', MESSAGES.tooLarge), 'lead.too_large');

  const text = await request.text();
  if (text.length > MAX_BODY) return done(fail(413, 'too_large', MESSAGES.tooLarge), 'lead.too_large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return done(fail(400, 'bad_json', MESSAGES.badJson), 'lead.bad_json');
  }

  const probe = (raw && typeof raw === 'object' ? raw : {}) as { website?: unknown; openedAt?: unknown };

  // Honeypot: a field no person can see or reach. Answer "ok" and store nothing, so a bot gets no signal to adapt to.
  if (typeof probe.website === 'string' && probe.website.trim() !== '') return done(reply(200, { ok: true }), 'lead.dropped', { reason: 'honeypot' });

  // Instant submission. `openedAt` is sent by the browser, so this guards against hasty or autofilled submits; it is not a
  // bot defence. A person must never be told "saved" when nothing was stored, so the answer is an honest "try again".
  if (typeof probe.openedAt === 'number' && now() - probe.openedAt < MIN_FILL_MS) {
    return done(reply(429, { ok: false, code: 'too_fast', message: MESSAGES.tooFast }, { 'Retry-After': '3' }), 'lead.too_fast');
  }

  const parsed = kind === 'membership' ? joinSchema.safeParse(raw) : newsletterSchema.safeParse(raw);
  if (!parsed.success) {
    const { fields, message } = fieldErrors(parsed.error);
    return done(fail(400, 'invalid', message, { fields }), 'lead.invalid', { fieldCount: Object.keys(fields).length });
  }
  const input = parsed.data as JoinInput | NewsletterInput;

  // Not enabled / no credentials / no salt: refuse instead of dropping data or limiting with a weak key.
  if (!store || !deps.ipSalt) return done(fail(503, 'unavailable', MESSAGES.unavailable), 'lead.not_configured', { store: Boolean(store), salt: Boolean(deps.ipSalt) });

  try {
    if (!clientIp) log.warn('lead.no_client_ip', { kind });
    const ipHash = await hashIp(clientIp ?? UNKNOWN_ADDRESS, deps.ipSalt);

    // Counted before the captcha call so repeated failures cannot be used to hammer the captcha provider or the database.
    const verdict = await store.registerAttempt(ipHash, kind, LIMITS);
    if (verdict !== 'ok') return done(fail(429, 'rate_limited', MESSAGES.rateLimited), 'lead.rate_limited', { reason: verdict });

    // Captcha is enforced on both forms whenever a secret is configured (each form carries the widget).
    if (deps.turnstileSecret) {
      const ok = await verifyTurnstile(deps.turnstileSecret, input.turnstileToken, clientIp, deps.fetchImpl);
      if (!ok) return done(fail(400, 'captcha', MESSAGES.captcha), 'lead.captcha_failed');
    }

    const join = kind === 'membership' ? (input as JoinInput) : undefined;
    const record: LeadRecord = {
      kind,
      name: join?.name ?? null,
      company: join?.company ?? null,
      email: input.email,
      phone: join?.phone || null,
      interest: join?.interest ?? null,
      message: join?.message || null,
      consent: true,
      consent_text_version: input.consentVersion,
      source_path: input.sourcePath,
      utm: input.utm,
      ip_hash: ipHash,
    };
    const result = await store.insert(record);
    // A repeated newsletter address is answered exactly like a new one: no way to probe who is subscribed.
    return done(reply(200, { ok: true }), 'lead.stored', { result });
  } catch (error) {
    return done(fail(503, 'unavailable', MESSAGES.unavailable), 'lead.store_failed', { error: error instanceof Error ? error.message.slice(0, 60) : 'unknown' });
  }
}
