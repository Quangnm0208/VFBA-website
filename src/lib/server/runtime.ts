/**
 * Wires the lead handler to the deployment environment (astro:env, schema in astro.config.mjs).
 * Kept apart from leads.ts so the handler itself stays free of Astro imports and is unit-testable.
 */
import { FORM_ALLOWED_ORIGINS, IP_HASH_SALT, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TURNSTILE_SECRET_KEY } from 'astro:env/server';
import { handleLead, type LeadDeps } from './leads';
import { createLogger } from './log';
import { createSupabaseStore, type LeadStore } from './store';
import type { LeadKind } from './validation';

let store: LeadStore | null | undefined;
function getStore(): LeadStore | null {
  if (store !== undefined) return store;
  store = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL.startsWith('https://') ? createSupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
  return store;
}

export function leadRoute(kind: LeadKind) {
  return async ({ request, clientAddress }: { request: Request; clientAddress?: string }): Promise<Response> => {
    const requestId = request.headers.get('x-vercel-id') ?? crypto.randomUUID();
    const deps: LeadDeps = {
      store: getStore(),
      log: createLogger(requestId),
      allowedOrigins: (FORM_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      turnstileSecret: TURNSTILE_SECRET_KEY,
      // Falls back to the service-role key so rate limiting still works if IP_HASH_SALT is forgotten.
      ipSalt: IP_HASH_SALT ?? SUPABASE_SERVICE_ROLE_KEY,
    };
    let ip: string | undefined;
    try {
      ip = clientAddress;
    } catch {
      ip = undefined;
    }
    return handleLead(request, kind, ip ?? request.headers.get('x-real-ip') ?? undefined, deps);
  };
}
