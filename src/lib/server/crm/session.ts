/**
 * CRM session cookies.
 *
 *  - `__Secure-vbfa-at` / `__Secure-vbfa-rt`: the Supabase Auth access and refresh tokens (HttpOnly, Secure, SameSite=Strict,
 *    Path=/admin). They are verified with Supabase Auth on every request; nothing is trusted from the cookie itself.
 *  - `__Secure-vbfa-ss`: signed session clock `{started, lastSeen, userId}`. It enforces an idle timeout and an absolute lifetime on
 *    top of Supabase's token lifetime, and is bound to the Auth user it was issued for (a clock cannot be paired with another
 *    person's tokens). The HMAC key is derived from the service-role key (server-only), so it needs no new secret.
 */
export const COOKIE_ACCESS = '__Secure-vbfa-at';
export const COOKIE_REFRESH = '__Secure-vbfa-rt';
export const COOKIE_SESSION = '__Secure-vbfa-ss';

/** Sign out after 30 minutes without a request, and after 8 hours at most. */
export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 8 * 3_600_000;

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function sessionKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = (async () => {
      const root = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const derived = await crypto.subtle.sign('HMAC', root, encoder.encode('vbfa-crm-session-v1'));
      return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })();
    keyCache.set(secret, key);
  }
  return key;
}

const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(32));
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const USER_ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export async function signSession(secret: string, started: number, lastSeen: number, userId: string): Promise<string> {
  const payload = `${started}.${lastSeen}.${userId.toLowerCase()}`;
  return `${payload}.${toHex(await crypto.subtle.sign('HMAC', await sessionKey(secret), encoder.encode(payload)))}`;
}

export type SessionCheck = { ok: true; started: number; lastSeen: number; userId: string } | { ok: false; reason: 'invalid' | 'idle' | 'absolute' };

export async function verifySession(secret: string, token: string | undefined, now: number): Promise<SessionCheck> {
  const match = new RegExp(`^(\\d{10,14})\\.(\\d{10,14})\\.(${USER_ID})\\.([0-9a-f]{64})$`).exec(token ?? '');
  if (!match) return { ok: false, reason: 'invalid' };
  const signature = fromHex(match[4]!);
  if (!signature || !(await crypto.subtle.verify('HMAC', await sessionKey(secret), signature, encoder.encode(`${match[1]}.${match[2]}.${match[3]}`)))) {
    return { ok: false, reason: 'invalid' };
  }
  const started = Number(match[1]);
  const lastSeen = Number(match[2]);
  if (now - started > ABSOLUTE_MS) return { ok: false, reason: 'absolute' };
  if (now - lastSeen > IDLE_MS || lastSeen > now + 60_000) return { ok: false, reason: 'idle' };
  return { ok: true, started, lastSeen, userId: match[3]! };
}

/**
 * Cookie header -> name/value. A name that appears more than once (cookie tossing from a sibling sub-domain, or a stale copy)
 * is returned as an empty value, so the request is treated as signed out instead of trusting whichever copy came first.
 */
export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (seen.has(name)) {
      out[name] = '';
      continue;
    }
    seen.add(name);
    try {
      out[name] = decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      out[name] = '';
    }
  }
  return out;
}

const ATTRIBUTES = 'Path=/admin; HttpOnly; Secure; SameSite=Strict';
export const setCookie = (name: string, value: string, maxAgeSeconds: number) => `${name}=${encodeURIComponent(value)}; ${ATTRIBUTES}; Max-Age=${maxAgeSeconds}`;
export const clearCookie = (name: string) => `${name}=; ${ATTRIBUTES}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
export const clearAll = () => [COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_SESSION].map(clearCookie);
