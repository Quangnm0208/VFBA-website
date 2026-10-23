/**
 * Wires the lead handler to the deployment environment (astro:env, schema in astro.config.mjs).
 * Kept apart from leads.ts so the handler itself stays free of Astro imports and is unit-testable.
 */
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client';
import { FORM_ALLOWED_ORIGINS, IP_HASH_SALT, LEADS_ENABLED, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, TURNSTILE_SECRET_KEY } from 'astro:env/server';
import { handleLead, type LeadDeps } from './leads';
import { createLogger } from './log';
import { createSupabaseStore, type LeadStore } from './store';
import type { LeadKind } from './validation';

let store: LeadStore | null | undefined;
function getStore(): LeadStore | null {
  if (store !== undefined) return store;
  // Form collection fails closed unless the approved go-live switch, an HTTPS database, the HMAC salt and BOTH Cloudflare
  // Turnstile keys are configured, so the CAPTCHA cannot be left off by accident.
  const enabled = LEADS_ENABLED === 'true';
  store = enabled && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL.startsWith('https://') && IP_HASH_SALT && PUBLIC_TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY ? createSupabaseStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
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
