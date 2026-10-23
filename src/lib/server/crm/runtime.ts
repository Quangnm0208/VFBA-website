/**
 * Wires the CRM to the deployment environment (astro:env, schema in astro.config.ts). Kept apart from app.ts so the handler
 * stays free of Astro imports and is unit-testable.
 */
import { CRM_ENABLED, FORM_ALLOWED_ORIGINS, IP_HASH_SALT, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from 'astro:env/server';
import { createLogger } from '../log';
import { handleCrm, respond, type CrmDeps } from './app';
import { createAuthClient } from './auth';
import { createSupabaseCrmStore } from './store';
import { errorPage } from './views';

type Wiring = Pick<CrmDeps, 'store' | 'auth' | 'sessionSecret' | 'ipSalt'> | null;
let wiring: Wiring | undefined;

function getWiring(): Wiring {
  if (wiring !== undefined) return wiring;
  // Fails closed: every part is required, the database must be HTTPS, and nothing falls back to another secret.
  wiring =
    SUPABASE_URL && SUPABASE_URL.startsWith('https://') && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_PUBLISHABLE_KEY && IP_HASH_SALT
      ? {
          store: createSupabaseCrmStore(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
          auth: createAuthClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY),
          sessionSecret: SUPABASE_SERVICE_ROLE_KEY,
          ipSalt: IP_HASH_SALT,
        }
      : null;
  return wiring;
}

export async function crmRoute({ request, clientAddress }: { request: Request; clientAddress?: string }): Promise<Response> {
  // Not switched on (production until the CRM is approved): the area simply does not exist.
  if (CRM_ENABLED !== 'true') return respond(404, errorPage('Không tìm thấy trang', 'Đường dẫn này không tồn tại.'));
  const requestId = request.headers.get('x-vercel-id') ?? crypto.randomUUID();
  const log = createLogger(requestId);
  const parts = getWiring();
  if (!parts) {
    log.error('crm.not_configured');
    return respond(503, errorPage('CRM chưa được cấu hình', 'Thiếu cấu hình máy chủ. Hãy báo cho quản trị hệ thống.'));
  }
  let ip: string | undefined;
  try {
    ip = clientAddress;
  } catch {
    ip = undefined;
  }
  return handleCrm(request, ip ?? request.headers.get('x-real-ip') ?? undefined, {
    ...parts,
    log,
    allowedOrigins: (FORM_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  });
}
