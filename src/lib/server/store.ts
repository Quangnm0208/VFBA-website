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
  ip_hash: string | null;
}

export interface LeadStore {
  /** Number of leads stored for this hashed address since `sinceIso`. */
  countRecent(ipHash: string, sinceIso: string): Promise<number>;
  /** `duplicate` when the newsletter address is already subscribed (unique index). */
  insert(record: LeadRecord): Promise<'created' | 'duplicate'>;
}

export function createSupabaseStore(url: string, serviceRoleKey: string): LeadStore {
  // Server only: the service-role key bypasses RLS and must never reach the browser.
  const db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async countRecent(ipHash, sinceIso) {
      const { count, error } = await db
        .from('website_leads')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', sinceIso);
      if (error) throw new Error(`countRecent:${error.code ?? 'error'}`);
      return count ?? 0;
    },
    async insert(record) {
      const { error } = await db.from('website_leads').insert(record);
      if (!error) return 'created';
      if (error.code === '23505' && record.kind === 'newsletter') return 'duplicate';
      throw new Error(`insert:${error.code ?? 'error'}`);
    },
  };
}
