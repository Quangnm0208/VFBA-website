#!/usr/bin/env node
/**
 * Read-only probe of the Sanity API with the repository token, to design the Admin Portal identity bridge on facts.
 * Prints structure only: key names, role names, booleans, status codes. Never prints the token, an email or an id.
 *
 *   SANITY_DEPLOY_TOKEN=<token> node scripts/qa/sanity-probe.mjs
 */
const token = process.env.SANITY_DEPLOY_TOKEN;
const projectId = process.env.SANITY_PROJECT_ID ?? 'iqyx5ttc';
if (!token) {
  console.error('SANITY_DEPLOY_TOKEN is not set.');
  process.exit(2);
}
const api = (host, path, headers = {}) => fetch(`https://${host}${path}`, { headers: { authorization: `Bearer ${token}`, ...headers }, signal: AbortSignal.timeout(10_000) });
const describe = (value, depth = 0) => {
  if (Array.isArray(value)) return `[${value.length}]`;
  if (value && typeof value === 'object') return depth > 1 ? '{…}' : `{${Object.keys(value).sort().join(',')}}`;
  return typeof value === 'string' ? `string(${value.length})` : String(typeof value);
};

// 1) Who does the project API say this token is? (this is what the portal's server will call)
for (const version of ['v2021-06-07', 'v2025-02-19']) {
  const response = await api(`${projectId}.api.sanity.io`, `/${version}/users/me`);
  const body = await response.json().catch(() => null);
  console.log(`project users/me ${version}: HTTP ${response.status}`);
  if (body && response.ok) {
    console.log('  keys:', Object.keys(body).sort().join(','));
    for (const [key, value] of Object.entries(body)) if (key !== 'email' && key !== 'id' && key !== 'name' && key !== 'displayName' && key !== 'profileImage') console.log(`  ${key}: ${typeof value === 'string' ? JSON.stringify(value.slice(0, 40)) : describe(value)}`);
    console.log(`  has email: ${typeof body.email === 'string' && body.email.includes('@')} · has id: ${typeof body.id === 'string' && body.id.length > 0}`);
    if (Array.isArray(body.roles)) console.log('  role names:', body.roles.map((role) => role?.name).join(',') || '(none)');
  }
}
// 2) The global API for the same token
const global = await api('api.sanity.io', '/v2021-06-07/users/me');
console.log(`global users/me: HTTP ${global.status}`);
// 3) Negative control: a made-up token must be refused
const bad = await fetch(`https://${projectId}.api.sanity.io/v2025-02-19/users/me`, { headers: { authorization: 'Bearer skInvalidTokenForProbe0000000000000000' }, signal: AbortSignal.timeout(10_000) });
console.log(`invalid token: HTTP ${bad.status}`);
const none = await fetch(`https://${projectId}.api.sanity.io/v2025-02-19/users/me`, { signal: AbortSignal.timeout(10_000) });
console.log(`no token: HTTP ${none.status}`);
// 4) May this token manage CORS origins? (decides whether the Owner has to add the admin origin by hand)
const cors = await api('api.sanity.io', `/v2021-06-07/projects/${projectId}/cors`);
console.log(`list CORS origins: HTTP ${cors.status}`);
if (cors.ok) {
  const origins = await cors.json();
  console.log('  existing origins:', origins.map((o) => `${o.origin}${o.allowCredentials ? ' (credentials)' : ''}`).join(' | ') || '(none)');
}
const members = await api('api.sanity.io', `/v2021-06-07/projects/${projectId}/users`);
console.log(`list project users: HTTP ${members.status}`);
if (members.ok) {
  const list = await members.json();
  console.log(`  members: ${Array.isArray(list) ? list.length : describe(list)}`);
}
