import { describe, expect, it, vi } from 'vitest';
import { createSanityVerifier } from './identity';

/**
 * The verifier against fakes of `GET https://<project>.api.sanity.io/<version>/users/me`.
 * The response shapes below were observed on the real project (probe run 39958212710, docs/evidence/ADMIN_PORTAL_*.md):
 * a session answers 200 with sanityUserId / email / provider / roles; an invalid token answers 401; NO token answers 200 (no user);
 * an API token answers 200 with provider "sanity-token" and no e-mail.
 */
const TOKEN = 'skAbCdEf0123456789AbCdEf0123456789AbCdEf0123456789';
const session = (over: Record<string, unknown> = {}) => ({
  id: 'p123',
  sanityUserId: 'gAbCdEfGh123',
  name: 'Nguyen Van A',
  givenName: 'Van A',
  familyName: 'Nguyen',
  email: 'Staff.One@VBFA.vn',
  provider: 'google',
  role: 'write',
  roles: [{ name: 'editor', title: 'Editor' }],
  profileImage: null,
  ...over,
});
const reply = (status: number, body: unknown) => () => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const verifier = (impl: (url: string, init: RequestInit) => Promise<Response>) => createSanityVerifier({ projectId: 'iqyx5ttc', fetchImpl: ((url: string, init: RequestInit) => impl(url, init)) as typeof fetch });

describe('Sanity identity verifier', () => {
  it('accepts a real session, lower-cases the e-mail and asks the project API with the bearer token and no redirects', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const result = await verifier((url, init) => {
      seen.push({ url, init });
      return reply(200, session())();
    }).verify(TOKEN);
    expect(result).toEqual({ ok: true, identity: { sanityUserId: 'gAbCdEfGh123', email: 'staff.one@vbfa.vn', provider: 'google', roles: ['editor'] } });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('https://iqyx5ttc.api.sanity.io/v2025-02-19/users/me');
    expect(new Headers(seen[0]!.init.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(seen[0]!.init.redirect).toBe('error');
    expect(seen[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('refuses a token Sanity rejects (401 / 403)', async () => {
    for (const status of [401, 403]) expect(await verifier(reply(status, { error: 'x' })).verify(TOKEN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('refuses a 200 that carries no user: "no token" also answers 200 on the real API, so the status alone proves nothing', async () => {
    for (const body of [null, {}, [], 'ok', 5, { sanityUserId: '' }, { sanityUserId: 7 }, { sanityUserId: 'x'.repeat(129), roles: [{ name: 'editor' }], email: 'a@b.co' }]) {
      expect(await verifier(reply(200, body)).verify(TOKEN), JSON.stringify(body)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(await verifier(() => Promise.resolve(new Response('<html>', { status: 200 }))).verify(TOKEN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('never treats an API (robot) token as a person: no e-mail, provider sanity-token', async () => {
    const robot = session({ provider: 'sanity-token', email: undefined, givenName: 'Deploy (Robot)', roles: [{ name: 'developer' }, { name: 'editor' }] });
    expect(await verifier(reply(200, robot)).verify(TOKEN)).toEqual({ ok: false, reason: 'robot' });
    // even a robot that somehow carries an e-mail stays a robot
    expect(await verifier(reply(200, { ...robot, email: 'robot@vbfa.vn' })).verify(TOKEN)).toEqual({ ok: false, reason: 'robot' });
  });

  it('requires project membership (at least one role in this project)', async () => {
    for (const roles of [[], undefined, 'editor', [{}], [{ name: 5 }], [null]]) expect(await verifier(reply(200, session({ roles }))).verify(TOKEN), JSON.stringify(roles)).toEqual({ ok: false, reason: 'not_member' });
  });

  it('requires a usable e-mail', async () => {
    for (const email of [undefined, '', '   ', 'no-at-sign', 'a@b', 5, `${'a'.repeat(250)}@b.co`]) expect(await verifier(reply(200, session({ email }))).verify(TOKEN), String(email)).toEqual({ ok: false, reason: 'no_email' });
  });

  it('fails closed and says "unavailable" when Sanity cannot answer: 5xx, 429, a timeout, a network error', async () => {
    for (const status of [500, 502, 503, 429]) expect(await verifier(reply(status, {})).verify(TOKEN), String(status)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await verifier(() => Promise.reject(new TypeError('fetch failed'))).verify(TOKEN)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await verifier(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))).verify(TOKEN)).toEqual({ ok: false, reason: 'unavailable' });
    expect(await verifier(reply(404, {})).verify(TOKEN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('does not call Sanity at all for a token that cannot be one', async () => {
    const calls = vi.fn(reply(200, session()));
    const v = verifier(calls);
    for (const token of ['', 'short', 'has space in it 0123456789', 'tok\nen0123456789abcdef', 'é'.repeat(30), 'a'.repeat(2049)]) {
      expect(await v.verify(token), JSON.stringify(token).slice(0, 30)).toEqual({ ok: false, reason: 'invalid' });
    }
    expect(calls).not.toHaveBeenCalled();
  });

  it('refuses a project id that could change the host', () => {
    for (const projectId of ['', 'x', 'a.b', 'evil.example/', 'iqyx5ttc.evil', 'IQYX5TTC', 'a'.repeat(30)]) expect(() => createSanityVerifier({ projectId }), projectId).toThrow();
    expect(() => createSanityVerifier({ projectId: 'iqyx5ttc' })).not.toThrow();
  });
});
