import { createClient } from '@supabase/supabase-js';

/** Persistence port. The only implementation talks to Supabase; tests use an in-memory fake. */
export interface LeadRecord {
  kind: 'membership' | 'newsletter';
  name: string | null;
  company: string | null;
  email: string;
  phone: string | null;
  interest: string | null;
  message: string | null;
  consent: true;
  consent_text_version: string;
  source_path: string;
  utm: Record<string, string>;
  ip_hash: string;
}

/** Outcome of `register_attempt`: proceed, too many requests, or too many stored leads from this address. */
export type Throttle = 'ok' | 'attempts' | 'leads';

export interface Limits {
  windowSeconds: number;
  maxAttempts: number;
  maxLeads: number;
}

export interface LeadStore {
  /** Records this attempt (stored or not) and says whether the visitor address may continue. One database round trip. */
  registerAttempt(ipHash: string, kind: LeadRecord['kind'], limits: Limits): Promise<Throttle>;
  /** `duplicate` when the newsletter address is already subscribed (unique index). */
  insert(record: LeadRecord): Promise<'created' | 'duplicate'>;
}

/**
 * Every Supabase call is cut off after this long so the visitor gets our JSON 503 instead of Vercel's 504 page
 * (the Function limit is 10 s; a request makes at most two database calls plus an optional captcha check).
 */
export const DB_TIMEOUT_MS = 3000;

const withTimeout: typeof fetch = (input, init) => {
  const limit = AbortSignal.timeout(DB_TIMEOUT_MS);
  return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, limit]) : limit });
};

const THROTTLES: readonly Throttle[] = ['ok', 'attempts', 'leads'];

export function createSupabaseStore(url: string, serviceRoleKey: string): LeadStore {
  // Server only: the service-role key bypasses RLS and must never reach the browser.
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: withTimeout } });
  return {
    async registerAttempt(ipHash, kind, limits) {
      const { data, error } = await db.rpc('register_attempt', {
        p_ip_hash: ipHash,
        p_kind: kind,
        p_window: `${limits.windowSeconds} seconds`,
        p_max_attempts: limits.maxAttempts,
        p_max_leads: limits.maxLeads,
      });
      if (error) throw new Error(`registerAttempt:${error.code ?? 'error'}`);
      if (!THROTTLES.includes(data as Throttle)) throw new Error('registerAttempt:unexpected');
      return data as Throttle;
    },
    async insert(record) {
      const { error } = await db.from('website_leads').insert(record);
      if (!error) return 'created';
      if (error.code === '23505' && record.kind === 'newsletter') return 'duplicate';
      throw new Error(`insert:${error.code ?? 'error'}`);
    },
  };
}
