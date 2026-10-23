/**
 * Who owns this Sanity session token? Asked of Sanity itself, by the server, on every request.
 *
 * The Admin Portal is a Sanity Studio: a person signs in once, with Sanity, and the Studio holds a session token. Its Leads tool sends
 * that token to the portal's Function, which does NOT trust anything the browser says about roles or e-mail: it asks the project API
 * `users/me` with the same token. Facts about that endpoint (probe run 39958212710, docs/evidence/ADMIN_PORTAL_2026-10-23.md):
 *   - OBSERVED with an API (robot) token: 200 with { sanityUserId, provider: "sanity-token", role, roles[], givenName, ... } and NO e-mail;
 *     the key set (email, id, provider, role, roles, sanityUserId, ...) is the one this code reads;
 *   - OBSERVED: an invalid token answers 401, and NO token also answers 200 (with no user), so a 200 alone proves nothing: the body is checked;
 *   - NOT YET OBSERVED: the body for a person's browser session (provider google/github/..., with e-mail). It is the same documented
 *     shape; it is confirmed by the Owner's first real sign-in (docs/OWNER_SETUP_GUIDE.vi.md, Step 8f). Until then the positive path is unproven.
 * Robots are never staff.
 * Everything unexpected is a refusal (fail closed). A failure of Sanity itself is "unavailable", never "allowed".
 */
export interface SanityIdentity {
  /** Stable Sanity user id (global to Sanity, not project scoped). */
  sanityUserId: string;
  /** Lower-cased e-mail Sanity holds for the account. */
  email: string;
  provider: string;
  /** Names of the person's roles in THIS project; a member has at least one. */
  roles: string[];
}

export type VerifyResult =
  | { ok: true; identity: SanityIdentity }
  | { ok: false; reason: 'invalid' | 'unavailable' | 'robot' | 'no_email' | 'not_member' };

export interface IdentityVerifier {
  verify(token: string): Promise<VerifyResult>;
}

/** Sanity session tokens are long opaque strings; anything else is refused before a network call is made. */
const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{16,2048}$/;
/**
 * Printable ASCII only (no '@' inside a part): Unicode-aware lower-casing could make two different strings equal, for example the
 * Kelvin sign and "k", so an address that is not plain ASCII is never matched against the allowlist.
 */
const EMAIL_SHAPE = /^[\x21-\x3f\x41-\x7e]+@[\x21-\x3f\x41-\x7e]+\.[\x21-\x3f\x41-\x7e]+$/;
export const SANITY_VERIFY_TIMEOUT_MS = 4000;

export function createSanityVerifier(options: { projectId: string; apiVersion?: string; fetchImpl?: typeof fetch; timeoutMs?: number }): IdentityVerifier {
  const { projectId, apiVersion = 'v2025-02-19', fetchImpl = fetch, timeoutMs = SANITY_VERIFY_TIMEOUT_MS } = options;
  // The host is built from a project id that is a constant of the deployment, never from the request (no SSRF).
  if (!/^[a-z0-9]{6,20}$/.test(projectId)) throw new Error('portal: invalid Sanity project id');
  const url = `https://${projectId}.api.sanity.io/${apiVersion}/users/me`;

  return {
    async verify(token) {
      if (!TOKEN_SHAPE.test(token)) return { ok: false, reason: 'invalid' };
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
      if (response.status === 401 || response.status === 403) return { ok: false, reason: 'invalid' };
      if (response.status !== 200) return { ok: false, reason: response.status >= 500 || response.status === 429 ? 'unavailable' : 'invalid' };

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        // The 4 s limit also covers reading the body: a Sanity that answers slowly is "unavailable", not a wrong token.
        const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return { ok: false, reason: timedOut ? 'unavailable' : 'invalid' };
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, reason: 'invalid' };
      const user = body as Record<string, unknown>;

      const sanityUserId = user.sanityUserId;
      if (typeof sanityUserId !== 'string' || sanityUserId.length < 1 || sanityUserId.length > 128) return { ok: false, reason: 'invalid' };
      const provider = typeof user.provider === 'string' ? user.provider : '';
      if (provider === 'sanity-token') return { ok: false, reason: 'robot' };

      const roles = Array.isArray(user.roles)
        ? user.roles.map((role) => (role && typeof role === 'object' ? (role as Record<string, unknown>).name : undefined)).filter((name): name is string => typeof name === 'string' && name.length > 0)
        : [];
      if (roles.length === 0) return { ok: false, reason: 'not_member' };

      // Checked as received, THEN folded: folding first would turn the Kelvin sign into an ASCII "k" before the check.
      const received = typeof user.email === 'string' ? user.email.trim() : '';
      if (received.length === 0 || received.length > 254 || !EMAIL_SHAPE.test(received)) return { ok: false, reason: 'no_email' };
      const email = received.toLowerCase();

      return { ok: true, identity: { sanityUserId, email, provider, roles } };
    },
  };
}
