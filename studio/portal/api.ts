/**
 * Browser side of the portal API. The only credential is the Sanity session token the Studio already holds; it travels in an
 * Authorization header to the same origin, never in a cookie, a URL or storage of ours. Nothing here decides who may do what:
 * the server asks Sanity who owns the token and checks the staff allowlist on every call (src/lib/server/crm/portal).
 */
export type Role = 'admin' | 'staff';
export interface Me {
  email: string;
  role: Role;
  kinds: string[];
}
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string };
export interface Api {
  call<T = Record<string, any>>(op: string, params?: Record<string, unknown>): Promise<ApiResult<T>>;
}

export const API_PATH = '/api/portal';

export function createApi(getToken: () => string | undefined, options: { endpoint?: string; fetchImpl?: typeof fetch } = {}): Api {
  const endpoint = options.endpoint ?? API_PATH;
  const doFetch = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  return {
    async call(op, params = {}) {
      const token = getToken();
      if (!token) return { ok: false, status: 401, code: 'no_token' };
      try {
        const response = await doFetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ op, ...params }),
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
        });
        let body: any = null;
        try {
          body = await response.json();
        } catch {
          // A host without the portal API (the Sanity-hosted Studio) answers HTML or nothing.
          return { ok: false, status: response.status, code: response.status === 404 || response.status === 405 ? 'not_here' : 'error' };
        }
        if (response.ok && body && body.ok === true) return { ok: true, data: body };
        return { ok: false, status: response.status, code: typeof body?.code === 'string' ? body.code : 'error' };
      } catch {
        return { ok: false, status: 0, code: 'network' };
      }
    },
  };
}
