import { fieldErrors, joinSchema, newsletterSchema, type JoinInput, type LeadKind, type NewsletterInput } from './validation';
import { hashIp } from './hash';
import { verifyTurnstile } from './turnstile';
import type { LeadRecord, LeadStore } from './store';
import type { Logger } from './log';

const MAX_BODY = 8 * 1024;
const MIN_FILL_MS = 2000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

export interface LeadDeps {
  /** null when Supabase is not configured: the route then fails closed (503) instead of dropping data. */
  store: LeadStore | null;
  log: Logger;
  now?: () => number;
  /** Exact origins allowed to post (the request's own origin is always allowed). */
  allowedOrigins?: string[];
  turnstileSecret?: string;
  /** Secret used to hash IP addresses for rate limiting. */
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
 * Order matters: cheap checks first (method/origin/size/shape), silent drops for bots (no signal to adapt to),
 * then validation, configuration, captcha, rate limit, storage.
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

  // Bots: honeypot filled, or submitted faster than a person can type. Answer "ok" and store nothing.
  const probe = (raw && typeof raw === 'object' ? raw : {}) as { website?: unknown; openedAt?: unknown };
  const tooFast = typeof probe.openedAt === 'number' && now() - probe.openedAt < MIN_FILL_MS;
  if ((typeof probe.website === 'string' && probe.website.trim() !== '') || tooFast) {
    return done(reply(200, { ok: true }), 'lead.dropped', { reason: tooFast ? 'too_fast' : 'honeypot' });
  }

  const parsed = kind === 'membership' ? joinSchema.safeParse(raw) : newsletterSchema.safeParse(raw);
  if (!parsed.success) {
    const { fields, message } = fieldErrors(parsed.error);
    return done(fail(400, 'invalid', message, { fields }), 'lead.invalid', { fieldCount: Object.keys(fields).length });
  }
  const input = parsed.data as JoinInput | NewsletterInput;

  if (!store) return done(fail(503, 'unavailable', MESSAGES.unavailable), 'lead.not_configured');

  // Captcha is enforced on the membership form (it has the widget) whenever a secret is configured.
  if (kind === 'membership' && deps.turnstileSecret) {
    const ok = await verifyTurnstile(deps.turnstileSecret, input.turnstileToken, clientIp, deps.fetchImpl);
    if (!ok) return done(fail(400, 'captcha', MESSAGES.captcha), 'lead.captcha_failed');
  }

  try {
    const ipHash = clientIp && deps.ipSalt ? await hashIp(clientIp, deps.ipSalt) : null;
    if (ipHash) {
      const recent = await store.countRecent(ipHash, new Date(now() - RATE_WINDOW_MS).toISOString());
      if (recent >= RATE_MAX) return done(fail(429, 'rate_limited', MESSAGES.rateLimited, undefined), 'lead.rate_limited');
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
      consent_text_version: join?.consentVersion ?? 'newsletter-action-v1',
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
