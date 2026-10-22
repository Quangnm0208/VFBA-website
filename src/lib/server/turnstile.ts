/** Cloudflare Turnstile server-side verification (siteverify). Bounded so that, with two database calls, a request stays under the 10 s Function limit. */
const TURNSTILE_TIMEOUT_MS = 3000;

export async function verifyTurnstile(secret: string, token: string, ip: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
