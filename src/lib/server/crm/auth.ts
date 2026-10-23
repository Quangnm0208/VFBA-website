/**
 * Supabase Auth (GoTrue) over REST. The CRM verifies every session with Supabase instead of decoding the token itself, so a
 * revoked or deleted session stops working at once. Only the publishable key is sent as `apikey`; the service-role key is
 * never used for sign-in.
 */
export interface AuthUser {
  id: string;
  email: string;
  confirmed: boolean;
}
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
export type TokenResult = { ok: true; tokens: Tokens } | { ok: false; reason: 'invalid' | 'unavailable' };
export type UserResult = { ok: true; user: AuthUser } | { ok: false; reason: 'invalid' | 'unavailable' };

export interface AuthClient {
  signIn(email: string, password: string): Promise<TokenResult>;
  refresh(refreshToken: string): Promise<TokenResult>;
  getUser(accessToken: string): Promise<UserResult>;
  signOut(accessToken: string): Promise<void>;
  updatePassword(accessToken: string, password: string): Promise<'ok' | 'weak' | 'same' | 'invalid' | 'unavailable'>;
}

export const AUTH_TIMEOUT_MS = 4000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readUser(body: unknown): AuthUser | null {
  const u = (body && typeof body === 'object' ? body : {}) as { id?: unknown; email?: unknown; email_confirmed_at?: unknown; confirmed_at?: unknown };
  if (typeof u.id !== 'string' || !UUID.test(u.id) || typeof u.email !== 'string' || !u.email) return null;
  return { id: u.id.toLowerCase(), email: u.email.toLowerCase(), confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at) };
}

export function createAuthClient(baseUrl: string, publishableKey: string, fetchImpl: typeof fetch = fetch): AuthClient {
  const root = `${baseUrl.replace(/\/+$/, '')}/auth/v1`;
  const call = (path: string, init: { method: string; token?: string; body?: unknown }) =>
    fetchImpl(`${root}${path}`, {
      method: init.method,
      headers: {
        apikey: publishableKey,
        'content-type': 'application/json',
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
      redirect: 'error',
    });

  const tokens = async (path: string, body: unknown): Promise<TokenResult> => {
    try {
      const response = await call(path, { method: 'POST', body });
      if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422) return { ok: false, reason: 'invalid' };
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      const data = (await response.json()) as { access_token?: unknown; refresh_token?: unknown; user?: unknown };
      const user = readUser(data.user);
      if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string' || !user) return { ok: false, reason: 'unavailable' };
      return { ok: true, tokens: { accessToken: data.access_token, refreshToken: data.refresh_token, user } };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };

  return {
    signIn: (email, password) => tokens('/token?grant_type=password', { email, password }),
    refresh: (refreshToken) => tokens('/token?grant_type=refresh_token', { refresh_token: refreshToken }),
    async getUser(accessToken) {
      try {
        const response = await call('/user', { method: 'GET', token: accessToken });
        if (response.status === 401 || response.status === 403 || response.status === 404) return { ok: false, reason: 'invalid' };
        if (!response.ok) return { ok: false, reason: 'unavailable' };
        const user = readUser(await response.json());
        return user ? { ok: true, user } : { ok: false, reason: 'unavailable' };
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
    },
    async signOut(accessToken) {
      try {
        await call('/logout?scope=local', { method: 'POST', token: accessToken });
      } catch {
        /* best effort: the cookies are cleared either way */
      }
    },
    async updatePassword(accessToken, password) {
      try {
        const response = await call('/user', { method: 'PUT', token: accessToken, body: { password } });
        if (response.ok) return 'ok';
        if (response.status === 401 || response.status === 403) return 'invalid';
        if (response.status === 422) {
          const body = (await response.json().catch(() => ({}))) as { error_code?: string };
          return body.error_code === 'same_password' ? 'same' : 'weak';
        }
        return 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
  };
}
