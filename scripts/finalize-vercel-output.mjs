#!/usr/bin/env node
/**
 * Post-build step for the Vercel Build Output (`npm run build` runs it after `astro build`).
 *
 * The Astro Vercel adapter writes one `{ src: <route>, headers: { content-security-policy } }` entry per
 * prerendered page, using the route's own spelling. Vercel matches `src` as an anchored regex against the
 * exact request path, and with `trailingSlash: 'always'` every page is requested as `/x/`. Two entries
 * therefore never match and would ship without a CSP header:
 *   - index routes are emitted without the trailing slash (`/tin-tuc` vs the request `/tin-tuc/`);
 *   - `/404` is never requested: unknown URLs are answered by the catch-all `dest: /404.html` rule.
 * This script rewrites those entries and then verifies that every built page is covered, so a
 * missing CSP fails the build instead of reaching production.
 *
 *   node scripts/finalize-vercel-output.mjs
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CSP = 'content-security-policy';
const hasCsp = (route) => Object.keys(route.headers ?? {}).some((name) => name.toLowerCase() === CSP);
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Vercel semantics: `src` is a regex anchored on the whole request path. */
export function routeMatches(route, url) {
  const body = route.src.replace(/^\^/, '').replace(/\$$/, '');
  return new RegExp(`^(?:${body})$`).test(url);
}

/** URLs of the prerendered pages as they are requested (`/`, `/x/`), excluding the 404 page. */
export async function pageUrls(staticDir) {
  const urls = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name === 'index.html') {
        const folder = relative(staticDir, dir).split(sep).join('/');
        urls.push(folder ? `/${folder}/` : '/');
      }
    }
  };
  await walk(staticDir);
  return urls.sort();
}

/** Returns a new config whose CSP routes match the real request paths; throws if a page stays uncovered. */
export function fixCspRoutes(config, urls) {
  const routes = [];
  let csp404;
  for (const route of config.routes) {
    const pageRoute = route.src && hasCsp(route) && !route.dest && !route.src.startsWith('^');
    if (!pageRoute) {
      routes.push(route);
      continue;
    }
    if (route.src === '/404' || route.src === '/404/') {
      csp404 = route.headers;
      continue;
    }
    const path = route.src.endsWith('/') ? route.src : `${route.src}/`;
    routes.push({ ...route, src: `^${escapeRegex(path)}$` });
  }

  const catchAll = routes.find((r) => r.dest === '/404.html' && r.status === 404);
  if (!catchAll) throw new Error('config.json has no catch-all 404 route (dest /404.html, status 404).');
  if (csp404 && !hasCsp(catchAll)) catchAll.headers = { ...catchAll.headers, ...csp404 };

  const pageRules = routes.filter((r) => r.src && hasCsp(r) && !r.dest);
  if (pageRules.length === 0) throw new Error('No Content-Security-Policy routes found: is `security.csp` enabled in astro.config.ts?');
  const missing = urls.filter((url) => !pageRules.some((rule) => routeMatches(rule, url)));
  if (missing.length) throw new Error(`No Content-Security-Policy route matches: ${missing.join(', ')}`);
  if (!hasCsp(catchAll)) throw new Error('The 404 catch-all route does not send a Content-Security-Policy header.');

  return { ...config, routes };
}

async function main() {
  const root = join(fileURLToPath(new URL('..', import.meta.url)), '.vercel/output');
  const configPath = join(root, 'config.json');
  const fixed = fixCspRoutes(JSON.parse(await readFile(configPath, 'utf8')), await pageUrls(join(root, 'static')));
  await writeFile(configPath, `${JSON.stringify(fixed, null, 2)}\n`);
  console.log('finalize-vercel-output: Content-Security-Policy routes match every page and the 404 response.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`finalize-vercel-output: ${error.message}`);
    process.exit(1);
  });
}
