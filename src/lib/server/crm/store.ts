import { createClient } from '@supabase/supabase-js';

/**
 * CRM persistence port. The only implementation calls the SECURITY DEFINER functions of migration 0007 with the service-role
 * key (server only); tests use an in-memory fake. The browser never talks to the database.
 */
export const LEAD_KINDS = ['membership', 'newsletter', 'contact'] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed', 'unsubscribed', 'deleted'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** The statuses a person can set: New -> In progress ("contacted") -> Closed. */
export const WORKFLOW_STATUSES = ['new', 'contacted', 'closed'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];
export type Role = 'admin' | 'staff';

export interface StaffIdentity {
  email: string;
  role: Role;
  kinds: LeadKind[];
}
export interface LeadRow {
  id: string;
  kind: LeadKind;
  name: string | null;
  company: string | null;
  email: string;
  status: LeadStatus;
  source_path: string;
  consent_at: string;
  created_at: string;
  notes: number;
}
export interface LeadDetail {
  lead: {
    id: string;
    kind: LeadKind;
    name: string | null;
    company: string | null;
    email: string;
    phone: string | null;
    interest: string | null;
    message: string | null;
    consent: boolean;
    consent_text_version: string;
    consent_at: string;
    source_path: string;
    utm: Record<string, string>;
    status: LeadStatus;
    created_at: string;
    updated_at: string;
  };
  notes: Array<{ id: string; author_email: string; body: string; created_at: string }>;
}
export interface StaffRow extends StaffIdentity {
  active: boolean;
  bound: boolean;
  last_login_at: string | null;
  created_at: string;
  created_by: string | null;
}
export interface ListFilter {
  kind?: LeadKind;
  status?: LeadStatus;
  from?: string;
  to?: string;
  q?: string;
  limit: number;
  offset: number;
}
export type StatusResult = 'ok' | 'noop' | 'conflict' | 'locked' | 'not_found';

/** The actor is not an active staff member (or lacks the admin role): the function refused. */
export class ForbiddenError extends Error {
  constructor() {
    super('forbidden');
  }
}

/** The function rejected the input (a value the Function should have validated first). */
export class BadInputError extends Error {
  constructor() {
    super('bad_input');
  }
}

export interface CrmStore {
  loginThrottle(ipHash: string, subjectHash: string): Promise<'ok' | 'ip' | 'account'>;
  /** Binds the verified Auth user to the allowlist on first use. null = not allowed. */
  login(userId: string, email: string): Promise<StaffIdentity | null>;
  whoami(userId: string): Promise<StaffIdentity | null>;
  recordEvent(actor: string, email: string, action: 'logout' | 'denied'): Promise<void>;
  listLeads(actor: string, filter: ListFilter): Promise<{ rows: LeadRow[]; total: number }>;
  getLead(actor: string, id: string): Promise<LeadDetail | null>;
  setStatus(actor: string, id: string, from: string, to: WorkflowStatus): Promise<StatusResult>;
  addNote(actor: string, id: string, body: string): Promise<'ok' | 'not_found'>;
  staffList(actor: string): Promise<StaffRow[]>;
  staffUpsert(actor: string, email: string, role: Role, kinds: LeadKind[], resetBinding: boolean): Promise<'created' | 'updated' | 'last_admin'>;
  staffSetActive(actor: string, email: string, active: boolean): Promise<'ok' | 'not_found' | 'last_admin'>;
}

/** Every database call is cut off after this long, so the person gets our error page instead of Vercel's 504. */
export const DB_TIMEOUT_MS = 4000;

const withTimeout: typeof fetch = (input, init) => {
  const limit = AbortSignal.timeout(DB_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, limit]) : limit });
};

export function createSupabaseCrmStore(url: string, serviceRoleKey: string): CrmStore {
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withTimeout } });

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      if (error.code === '42501') throw new ForbiddenError();
      if (error.code === '22023') throw new BadInputError();
      throw new Error(`crm.${fn}:${error.code || 'error'}`);
    }
    return data as T;
  }
  const identity = (rows: Array<{ email: string; role: Role; kinds: LeadKind[] }> | null): StaffIdentity | null => {
    const row = rows?.[0];
    return row ? { email: row.email, role: row.role, kinds: row.kinds } : null;
  };

  return {
    async loginThrottle(ipHash, subjectHash) {
      const verdict = await rpc<string>('crm_login_throttle', { p_ip_hash: ipHash, p_subject_hash: subjectHash });
      if (verdict !== 'ok' && verdict !== 'ip' && verdict !== 'account') throw new Error('crm.crm_login_throttle:unexpected');
      return verdict;
    },
    async login(userId, email) {
      return identity(await rpc('crm_login', { p_user_id: userId, p_email: email }));
    },
    async whoami(userId) {
      return identity(await rpc('crm_whoami', { p_user_id: userId }));
    },
    async recordEvent(actor, email, action) {
      await rpc('crm_record_event', { p_actor: actor, p_email: email, p_action: action });
    },
    async listLeads(actor, f) {
      const data = await rpc<Array<LeadRow & { total: number }>>('crm_list_leads', {
        p_actor: actor,
        p_kind: f.kind ?? null,
        p_status: f.status ?? null,
        p_from: f.from ?? null,
        p_to: f.to ?? null,
        p_q: f.q ?? null,
        p_limit: f.limit,
        p_offset: f.offset,
      });
      const rows = (data ?? []).map(({ total: _total, ...row }) => ({ ...row, notes: Number(row.notes) }));
      return { rows, total: Number(data?.[0]?.total ?? 0) };
    },
    async getLead(actor, id) {
      return (await rpc<LeadDetail | null>('crm_get_lead', { p_actor: actor, p_id: id })) ?? null;
    },
    async setStatus(actor, id, from, to) {
      const result = await rpc<string>('crm_set_status', { p_actor: actor, p_id: id, p_from: from, p_to: to });
      if (!['ok', 'noop', 'conflict', 'locked', 'not_found'].includes(result)) throw new Error('crm.crm_set_status:unexpected');
      return result as StatusResult;
    },
    async addNote(actor, id, body) {
      const result = await rpc<string>('crm_add_note', { p_actor: actor, p_id: id, p_body: body });
      if (result !== 'ok' && result !== 'not_found') throw new Error('crm.crm_add_note:unexpected');
      return result;
    },
    async staffList(actor) {
      return (await rpc<StaffRow[]>('crm_staff_list', { p_actor: actor })) ?? [];
    },
    async staffUpsert(actor, email, role, kinds, resetBinding) {
      const result = await rpc<string>('crm_staff_upsert', { p_actor: actor, p_email: email, p_role: role, p_kinds: kinds, p_reset_binding: resetBinding });
      if (result !== 'created' && result !== 'updated' && result !== 'last_admin') throw new Error('crm.crm_staff_upsert:unexpected');
      return result;
    },
    async staffSetActive(actor, email, active) {
      const result = await rpc<string>('crm_staff_set_active', { p_actor: actor, p_email: email, p_active: active });
      if (result !== 'ok' && result !== 'not_found' && result !== 'last_admin') throw new Error('crm.crm_staff_set_active:unexpected');
      return result;
    },
  };
}
