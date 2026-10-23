#!/usr/bin/env node
/**
 * Checks the tree written by build-vercel-output.mjs: what Vercel will serve must be what we think it serves.
 *   node scripts/check-vercel-output.mjs
 * - config.json: version 3, security headers on every path, filesystem lookup before the SPA fallback, unknown /api paths are 404;
 * - the function: config as the Nodejs launcher expects it, and the bundle really exports a (req, res) listener;
 * - the static tree: index.html present, and nothing server-side (service-role key name, Supabase URL, CRM function names) shipped to browsers.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STUDIO_ROOT } from './bundle-portal.mjs';
import { FUNCTION_CONFIG, ROUTES, SECURITY_HEADERS } from './build-vercel-output.mjs';

const output = join(STUDIO_ROOT, '.vercel', 'output');
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  - ${detail}`}`);
  if (!ok) failures.push(name);
};

const config = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8'));
check('config.json is Build Output API v3 and equals what the build script defines', config.version === 3 && JSON.stringify(config.routes) === JSON.stringify(ROUTES));
const filesystem = config.routes.findIndex((r) => r.handle === 'filesystem');
const fallback = config.routes.findIndex((r) => r.dest === '/index.html');
const api404 = config.routes.findIndex((r) => r.src === '/api/(.*)' && r.status === 404);
const static404 = config.routes.findIndex((r) => r.src === '/static/(.*)' && r.status === 404);
check('static files and functions are looked up before the SPA fallback; unknown /api paths and missing bundles are 404 before it', filesystem >= 0 && api404 > filesystem && static404 > filesystem && fallback > api404 && fallback > static404);
const hit = config.routes.findIndex((r) => r.handle === 'hit');
const immutable = config.routes.findIndex((r) => /immutable/.test(r.headers?.['Cache-Control'] ?? ''));
check('the one-year immutable lifetime is only attached after a real hit, and only to /static/ bundles', hit > fallback && immutable > hit && config.routes[immutable].src === '/static/(.*)' && config.routes.filter((r) => /immutable/.test(JSON.stringify(r.headers ?? {}))).length === 1);
const first = config.routes[0];
check('every path gets the security headers (framing denied, nosniff, HSTS, noindex, CSP report-only)', first?.src === '/(.*)' && first.continue === true && Object.keys(SECURITY_HEADERS).every((h) => first.headers?.[h]) && /DENY/.test(first.headers['X-Frame-Options']) && /noindex/.test(first.headers['X-Robots-Tag']));
check('no route allows cross-origin access (no Access-Control-* header anywhere)', !JSON.stringify(config.routes).toLowerCase().includes('access-control-'));

const fn = join(output, 'functions', 'api', 'portal.func');
const vc = JSON.parse(readFileSync(join(fn, '.vc-config.json'), 'utf8'));
check('function config: Node 22, Nodejs launcher, no helpers, handler file exists', JSON.stringify(vc) === JSON.stringify(FUNCTION_CONFIG) && /^nodejs22\./.test(vc.runtime) && vc.launcherType === 'Nodejs' && statSync(join(fn, vc.handler)).isFile());
const mod = await import(pathToFileURL(join(fn, vc.handler)).href);
check('the bundle exports a (req, res) listener as default', typeof mod.default === 'function' && mod.default.length === 2, typeof mod.default);

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = walk(join(output, 'static'));
check('the Studio is in static/ (index.html + hashed bundles)', files.some((f) => f.endsWith('/index.html')) && files.filter((f) => f.endsWith('.js')).length > 10, `${files.length} files`);
const forbidden = ['SUPABASE_SERVICE_ROLE_KEY', 'service_role', 'bzrtllytykldnawbuszu', 'crm_portal_login', 'crm_portal_whoami', 'crm_staff_upsert'];
const leaks = [];
for (const file of files.filter((f) => /\.(js|css|html|json|map|txt)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const word of forbidden) if (text.includes(word)) leaks.push(`${file.slice(output.length)} contains ${word}`);
}
check('nothing server-side is shipped to browsers (service-role key name, Supabase project, CRM function names)', leaks.length === 0, leaks.slice(0, 3).join('; '));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
