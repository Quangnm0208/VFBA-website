/**
 * Vercel Function of the VBFA Admin project: POST /api/portal (the CRM API behind the Leads and Staff tools of the Studio).
 *
 * The logic lives in src/lib/server/crm/portal (shared with the website repository's tests). `npm run build` bundles this file and
 * everything it imports with esbuild into the Build Output API tree (.vercel/output/functions/api/portal.func), so the deployed function
 * never depends on module resolution at run time. The entry is a plain Node (req, res) listener: that is the contract of the
 * `launcherType: "Nodejs"` function, and the same bundle is what the browser QA (scripts/qa/portal-host.mjs) drives.
 * Configuration (Vercel project environment, server side only; none of it reaches the browser bundle):
 *   SUPABASE_URL                 https URL of the Supabase project
 *   SUPABASE_SERVICE_ROLE_KEY    service-role key (Sensitive). Used only here, only to call the CRM functions.
 *   SANITY_STUDIO_PROJECT_ID     the Sanity project whose members may sign in (also read by the Studio build)
 * Missing or malformed configuration answers 503 and nothing else: it never falls back to another source.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLogger } from '../../src/lib/server/log';
import { handlePortal, type PortalDeps } from '../../src/lib/server/crm/portal/handler';
import { createSanityVerifier } from '../../src/lib/server/crm/portal/identity';
import { createSupabaseCrmStore } from '../../src/lib/server/crm/store';

type Parts = Pick<PortalDeps, 'store' | 'identity'>;
let parts: Parts | null | undefined;

function getParts(): Parts | null {
  if (parts !== undefined) return parts;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const project = process.env.SANITY_STUDIO_PROJECT_ID;
  try {
    parts = url && url.startsWith('https://') && key && project ? { store: createSupabaseCrmStore(url, key), identity: createSanityVerifier({ projectId: project }) } : null;
  } catch {
    parts = null;
  }
  return parts;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store, max-age=0', 'x-content-type-options': 'nosniff' };
const failure = (status: number, code: string) => new Response(JSON.stringify({ ok: false, code }), { status, headers: JSON_HEADERS });

/** The portal bodies are tiny (a note is ~6 KB); the handler enforces its own 32 KB limit, this one stops reading a stream that never ends. */
const READ_LIMIT = 64 * 1024;

async function readBody(req: IncomingMessage): Promise<Buffer | 'too_large'> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += piece.length;
    if (size > READ_LIMIT) return 'too_large';
    chunks.push(piece);
  }
  return Buffer.concat(chunks);
}

export async function handle(request: Request): Promise<Response> {
  const log = createLogger(request.headers.get('x-vercel-id') ?? crypto.randomUUID());
  const wired = getParts();
  if (!wired) {
    log.error('portal.not_configured');
    return failure(503, 'not_configured');
  }
  return handlePortal(request, { ...wired, log });
}

/**
 * Node listener -> Fetch API. The origin used for the same-origin check is built from the Host header and the proxy's
 * `x-forwarded-proto` (Vercel's edge sets both; a browser cannot choose them for another host).
 */
export default async function listener(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let response: Response;
  try {
    const method = req.method ?? 'GET';
    const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0]!.trim() === 'http' ? 'http' : 'https';
    const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(name, item);
      else if (value !== undefined) headers.set(name, value);
    }
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
    response = body === 'too_large' ? failure(413, 'too_large') : await handle(new Request(url, { method, headers, body: body ? new Uint8Array(body) : undefined }));
  } catch {
    response = failure(500, 'error');
  }
  const out: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    out[name] = value;
  });
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}
