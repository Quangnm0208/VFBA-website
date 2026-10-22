/**
 * Wires the lead handler to the deployment environment (astro:env, schema in astro.config.mjs).
 * Kept apart from leads.ts so the handler itself stays free of Astro imports and is unit-testable.
 */
import { FORM_ALLOWED_ORIGINS, IP_HASH_SALT, LEADS_ENABLED, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TURNSTILE_SECRET_KEY } from 'astro:env/server';
import { handleLead, type LeadDeps } from './leads';
import { createLogger } from './log';
import { createSupabaseStore, type LeadStore } from './store';
import type { LeadKind } from './validation';

let store: LeadStore | null | undefined;
function getStore(): LeadStore | null {
  if (store !== undefined) return store;
  // Three things must all be present: the explicit go-live switch (set only after the privacy policy and consent text are
  // approved), HTTPS Supabase credentials. The address-hashing salt is checked per request in the handler.
  const enabled = LEADS_ENABLED === 'true';
  store = enabled && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL.startsWith('https://') ? createSupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
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
      // Deliberately no fallback to another secret: a missing salt makes the route fail closed.
      ipSalt: IP_HASH_SALT,
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
