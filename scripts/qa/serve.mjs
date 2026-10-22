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

const headerRules = config.routes.filter((r) => r.headers && !r.status && r.src);
const headersFor = (pathname) => {
  const out = {};
  for (const rule of headerRules) {
    const exact = !rule.src.startsWith('^');
    const hit = exact ? rule.src.replace(/\/$/, '') === pathname.replace(/\/$/, '') : new RegExp(rule.src).test(pathname);
    if (hit) Object.assign(out, rule.headers);
  }
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
  const headers = headersFor(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': types['.html'], ...headers });
    return res.end(await readFile(join(root, 'static/404.html')));
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', ...headers });
  res.end(await readFile(file));
}).listen(port, () => console.log(`serving .vercel/output/static on http://localhost:${port}`));
