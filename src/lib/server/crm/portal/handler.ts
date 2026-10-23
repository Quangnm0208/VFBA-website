/**
 * CRM API of the Admin Portal (JSON over POST). One endpoint, one operation per request: `{ "op": "...", ...params }`.
 *
 * Trust model, in order, on EVERY request:
 *   1. the caller sends a Sanity session token in `Authorization: Bearer ...` (never a cookie: nothing ambient, no CSRF surface);
 *   2. the server asks Sanity who owns it (identity.ts); the browser's claims about roles or e-mail are never read;
 *   3. the verified (Sanity id, e-mail) must be an active, already bound row of the staff allowlist (crm_portal_whoami);
 *      `session` is the one operation that may bind a first sign-in (crm_portal_login);
 *   4. each lead / staff function re-checks the actor and its lead scope in the database (SECURITY DEFINER, service role only).
 * A person who signs out of Sanity loses access on the next request: there is no second session to revoke.
 * The service-role key never leaves the server. Logs carry the operation, status, role and duration only.
 */
import type { Logger } from '../../log';
import {
  BadInputError,
  ForbiddenError,
  LEAD_KINDS,
  LEAD_STATUSES,
  safeErrorLabel,
  WORKFLOW_STATUSES,
  type CrmStore,
  type LeadKind,
  type LeadStatus,
  type PortalActor,
  type WorkflowStatus,
} from '../store';
import type { IdentityVerifier } from './identity';

export interface PortalDeps {
  store: CrmStore;
  identity: IdentityVerifier;
  log: Logger;
}

export const PORTAL_PAGE_SIZE = 25;
/** A 2000-character note is ~6 KB of JSON even with diacritics; the limit leaves room and still refuses abuse. */
const MAX_BODY = 32 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  Vary: 'Authorization, Origin',
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const fail = (status: number, code: string, extra: Record<string, string> = {}) => json(status, { ok: false, code }, extra);

/** PostgreSQL text cannot hold NUL. */
const clean = (value: string) => value.replace(/\u0000/g, '');
const asString = (value: unknown, max: number): string | undefined => (typeof value === 'string' ? clean(value).trim().slice(0, max) : undefined);
const validDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sameOrigin(request: Request): boolean {
  const own = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin !== null && origin !== own) return false;
  const site = request.headers.get('sec-fetch-site');
  return site === null || site === 'same-origin' || site === 'none';
}

async function readJson(request: Request): Promise<Record<string, unknown> | 'too_large' | 'bad'> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) return 'too_large';
  const text = await request.text();
  if (text.length > MAX_BODY) return 'too_large';
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : 'bad';
  } catch {
    return 'bad';
  }
}

export async function handlePortal(request: Request, deps: PortalDeps): Promise<Response> {
  const started = performance.now();
  const { log } = deps;
  let op = 'unknown';
  let role = 'none';
  const done = (response: Response): Response => {
    log.info('portal.request', { op, status: response.status, role, durationMs: Math.round(performance.now() - started) });
    return response;
  };

  if (request.method !== 'POST') return done(fail(405, 'method', { Allow: 'POST' }));
  if (!sameOrigin(request)) return done(fail(403, 'origin'));
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return done(fail(415, 'content_type'));

  // 1) the credential
  const authorization = request.headers.get('authorization') ?? '';
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) return done(fail(401, 'unauthorized'));

  const body = await readJson(request);
  if (body === 'too_large') return done(fail(413, 'too_large'));
  if (body === 'bad') return done(fail(400, 'bad_json'));
  op = typeof body.op === 'string' && /^[a-z]+(\.[A-Za-z]+)?$/.test(body.op) ? body.op : 'unknown';

  // 2) who owns it? Asked of Sanity.
  const verified = await deps.identity.verify(match[1]!);
  if (!verified.ok) {
    log.warn('portal.unauthorized', { reason: verified.reason });
    if (verified.reason === 'unavailable') return done(fail(503, 'identity_unavailable', { 'Retry-After': '5' }));
    return done(verified.reason === 'invalid' ? fail(401, 'unauthorized') : fail(403, 'not_allowed'));
  }
  const { sanityUserId, email } = verified.identity;

  try {
    // 3) is that person staff? `session` may bind a first sign-in, everything else needs an existing binding.
    let staff: PortalActor | null;
    if (op === 'session') {
      staff = await deps.store.portalLogin(sanityUserId, email);
      if (!staff) await deps.store.portalDenied(sanityUserId, email, 'not_staff');
    } else {
      staff = await deps.store.portalWhoami(sanityUserId, email);
    }
    if (!staff) return done(fail(403, 'not_staff'));
    role = staff.role;

    // 4) the operation (the database re-checks the actor and the scope again)
    return done(await dispatch(op, body, staff, deps.store));
  } catch (error) {
    if (error instanceof ForbiddenError) return done(fail(403, 'forbidden'));
    if (error instanceof BadInputError) return done(fail(400, 'bad_input'));
    log.error('portal.error', { op, label: safeErrorLabel(error) });
    return done(fail(500, 'error'));
  }
}

async function dispatch(op: string, input: Record<string, unknown>, staff: PortalActor, store: CrmStore): Promise<Response> {
  const me = { email: staff.email, role: staff.role, kinds: staff.kinds };
  switch (op) {
    case 'session':
      return json(200, { ok: true, me });

    case 'leads.list': {
      const kind = LEAD_KINDS.find((k) => k === input.kind);
      const status = LEAD_STATUSES.find((s) => s === input.status && s !== 'deleted');
      const page = Math.min(10_000, Math.max(1, Math.floor(Number(input.page)) || 1));
      const filter = { kind: kind as LeadKind | undefined, status: status as LeadStatus | undefined, from: validDate(input.from), to: validDate(input.to), q: asString(input.q, 100) || undefined };
      const { rows, total } = await store.listLeads(staff.actor, { ...filter, limit: PORTAL_PAGE_SIZE, offset: (page - 1) * PORTAL_PAGE_SIZE });
      return json(200, { ok: true, me, rows, total, page, pageSize: PORTAL_PAGE_SIZE });
    }

    case 'leads.get': {
      if (typeof input.id !== 'string' || !UUID.test(input.id)) return fail(400, 'bad_input');
      const detail = await store.getLead(staff.actor, input.id);
      // Not found, erased and outside the person's scope look the same.
      return detail ? json(200, { ok: true, me, ...detail }) : fail(404, 'not_found');
    }

    case 'leads.status': {
      const to = WORKFLOW_STATUSES.find((s) => s === input.to) as WorkflowStatus | undefined;
      const from = LEAD_STATUSES.find((s) => s === input.from);
      if (typeof input.id !== 'string' || !UUID.test(input.id) || !to || !from) return fail(400, 'bad_input');
      const result = await store.setStatus(staff.actor, input.id, from, to);
      if (result === 'not_found') return fail(404, 'not_found');
      if (result === 'conflict' || result === 'locked') return fail(409, result);
      return json(200, { ok: true, result });
    }

    case 'leads.note': {
      const note = typeof input.body === 'string' ? clean(input.body).trim() : '';
      const length = Array.from(note).length;
      if (typeof input.id !== 'string' || !UUID.test(input.id)) return fail(400, 'bad_input');
      if (length < 1 || length > 2000) return fail(400, 'note_invalid');
      const result = await store.addNote(staff.actor, input.id, note);
      return result === 'not_found' ? fail(404, 'not_found') : json(200, { ok: true });
    }

    case 'staff.list': {
      if (staff.role !== 'admin') return fail(403, 'forbidden');
      return json(200, { ok: true, me, staff: await store.staffList(staff.actor) });
    }

    case 'staff.upsert': {
      if (staff.role !== 'admin') return fail(403, 'forbidden');
      const target = asString(input.email, 254)?.toLowerCase() ?? '';
      const roleValue = input.role;
      const kinds = LEAD_KINDS.filter((k) => Array.isArray(input.kinds) && input.kinds.includes(k));
      if (!EMAIL.test(target) || (roleValue !== 'admin' && roleValue !== 'staff') || kinds.length === 0) return fail(400, 'bad_input');
      const result = await store.staffUpsert(staff.actor, target, roleValue, kinds, input.reset === true);
      return result === 'last_admin' ? fail(409, 'last_admin') : json(200, { ok: true, result });
    }

    case 'staff.setActive': {
      if (staff.role !== 'admin') return fail(403, 'forbidden');
      const target = asString(input.email, 254)?.toLowerCase() ?? '';
      if (!EMAIL.test(target) || typeof input.active !== 'boolean') return fail(400, 'bad_input');
      const result = await store.staffSetActive(staff.actor, target, input.active);
      if (result === 'not_found') return fail(404, 'not_found');
      return result === 'last_admin' ? fail(409, 'last_admin') : json(200, { ok: true, result });
    }

    default:
      return fail(400, 'unknown_op');
  }
}
