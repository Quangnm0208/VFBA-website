/**
 * Preloaded (node --import) into the portal host process of the LOCAL stack only. The sandbox cannot reach Sanity, so calls to the
 * project's `users/me` are answered here, reproducing what the real API was observed to do (probe, docs/evidence/ADMIN_PORTAL_*.md):
 * a valid session -> 200 + user; an unknown token -> 401; NO token -> 200 with no user (null). Everything else goes to the network.
 * Users come from FAKE_SANITY_USERS = { "<token>": { sanityUserId, email, provider, roles:[{name}] } }.
 */
const users = JSON.parse(process.env.FAKE_SANITY_USERS ?? '{}');
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!/^https:\/\/[a-z0-9]+\.api\.sanity\.io\/v[\d-]+\/users\/me$/.test(url)) return real(input, init);
  const authorization = new Headers(init?.headers).get('authorization') ?? '';
  const token = /^Bearer (.+)$/.exec(authorization)?.[1];
  const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (!token) return json(200, null);
  const user = users[token];
  return user ? json(200, { id: 'p-fake', name: 'Fake', ...user }) : json(401, { error: 'Unauthorized' });
};
