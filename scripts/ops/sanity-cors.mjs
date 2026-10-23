#!/usr/bin/env node
/**
 * Adds ONE exact origin to the Sanity project's CORS list (with credentials, which the Studio sign-in needs). Idempotent: an origin that
 * is already listed is left alone. Refuses wildcards, non-https origins and anything that is not a VBFA Vercel host.
 *
 *   SANITY_DEPLOY_TOKEN=<token> node scripts/ops/sanity-cors.mjs https://vbfa-admin-git-<branch>-quangnm.vercel.app
 *
 * Prints the resulting list (origins are not secrets). Never prints the token.
 */
const [origin] = process.argv.slice(2);
const token = process.env.SANITY_DEPLOY_TOKEN;
const projectId = process.env.SANITY_PROJECT_ID ?? 'iqyx5ttc';
if (!token) {
  console.error('SANITY_DEPLOY_TOKEN is not set.');
  process.exit(2);
}
if (!origin || !/^https:\/\/vbfa-admin(-[a-z0-9-]+)?-quangnm\.vercel\.app$/.test(origin) || origin.includes('*')) {
  console.error('Refused: the origin must be an exact https://vbfa-admin...-quangnm.vercel.app host (no wildcard).');
  process.exit(2);
}
const api = (path, init = {}) =>
  fetch(`https://api.sanity.io/v2021-06-07/projects/${projectId}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(15_000) });

const list = await api('/cors');
if (!list.ok) {
  console.error(`Cannot list CORS origins: HTTP ${list.status}`);
  process.exit(1);
}
const existing = await list.json();
const found = existing.find((entry) => entry.origin === origin);
if (found && found.allowCredentials) {
  console.log(`Already present with credentials: ${origin}`);
} else {
  if (found) await api(`/cors/${found.id}`, { method: 'DELETE' }); // present without credentials: replace
  const created = await api('/cors', { method: 'POST', body: JSON.stringify({ origin, allowCredentials: true }) });
  if (!created.ok) {
    console.error(`Cannot add the origin: HTTP ${created.status} (the token may lack the permission to manage CORS: add it in sanity.io/manage > API > CORS origins)`);
    process.exit(1);
  }
  console.log(`Added with credentials: ${origin}`);
}
const after = await (await api('/cors')).json();
console.log('CORS origins now:');
for (const entry of after) console.log(`  ${entry.origin}${entry.allowCredentials ? ' (credentials)' : ''}`);
if (after.some((entry) => /\*/.test(entry.origin) && entry.allowCredentials)) {
  console.error('WARNING: a wildcard origin with credentials exists. Remove it.');
  process.exit(1);
}
