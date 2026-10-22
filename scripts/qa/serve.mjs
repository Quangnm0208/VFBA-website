#!/usr/bin/env node
/**
 * Serves .vercel/output/static the way Vercel will: per-route headers (CSP, cache-control) from
 * .vercel/output/config.json, clean trailing-slash URLs and the 404 page. API routes are NOT served
 * (they are Vercel Functions); the e2e suite mocks them.
 *   node scripts/qa/serve.mjs [port]
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.argv[2] || 4322);
const root = join(process.cwd(), '.vercel/output');
const config = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// Vercel matches `src` as a regex anchored on the whole request path (trailing slash included), so do the same:
// a CSP route spelled `/tin-tuc` must NOT apply to `/tin-tuc/`.
const matches = (rule, pathname) => new RegExp(`^(?:${rule.src.replace(/^\^/, '').replace(/\$$/, '')})$`).test(pathname);
const headerRules = config.routes.filter((r) => r.headers && !r.dest && !r.status && r.src);
const notFoundRule = config.routes.find((r) => r.dest === '/404.html' && r.status === 404);
const headersFor = (pathname) => {
  const out = {};
  for (const rule of headerRules) if (matches(rule, pathname)) Object.assign(out, rule.headers);
  return out;
};

async function fileFor(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, join(clean, 'index.html')]) {
    const full = join(root, 'static', candidate);
    try { if ((await stat(full)).isFile()) return full; } catch { /* next */ }
  }
  return null;
}

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (!extname(pathname) && !pathname.endsWith('/')) { res.writeHead(308, { Location: `${pathname}/` }); return res.end(); }
  const file = await fileFor(pathname);
  const headers = file ? headersFor(pathname) : { ...headersFor(pathname), ...notFoundRule?.headers };
  if (!file) {
    res.writeHead(404, { 'Content-Type': types['.html'], ...headers });
    return res.end(await readFile(join(root, 'static/404.html')));
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', ...headers });
  res.end(await readFile(file));
}).listen(port, () => console.log(`serving .vercel/output/static on http://localhost:${port}`));
