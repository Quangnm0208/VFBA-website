#!/usr/bin/env node
/**
 * Serves .vercel/output/static the way Vercel will: per-route headers (CSP, cache-control) from
 * .vercel/output/config.json, clean trailing-slash URLs and the 404 page. API routes are NOT served
 * (they are Vercel Functions); the e2e suite mocks them.
 *   node scripts/qa/serve.mjs [port]
 */
import http from 'node:http';
import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';

const port = Number(process.argv[2] || 4322);
const root = join(process.cwd(), '.vercel/output');
// config.json holds the per-route CSP (with hashes of the inline styles): reload it whenever a new build replaces it,
// otherwise a server started before `npm run build` would enforce stale hashes and block the new inline styles.
const configPath = join(root, 'config.json');
let config;
let configStamp = 0;
async function loadConfig() {
  try {
    const { mtimeMs } = await stat(configPath);
    if (mtimeMs !== configStamp) {
      config = JSON.parse(await readFile(configPath, 'utf8'));
      configStamp = mtimeMs;
    }
  } catch {
    if (!config) throw new Error('No build output: run `npm run build` first.');
    // a build is rewriting the output right now: keep serving with the previous config
  }
}
await loadConfig();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.otf': 'font/otf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// Vercel matches `src` as a regex anchored on the whole request path (trailing slash included), so do the same:
// a CSP route spelled `/tin-tuc` must NOT apply to `/tin-tuc/`.
const matches = (rule, pathname) => new RegExp(`^(?:${rule.src.replace(/^\^/, '').replace(/\$$/, '')})$`).test(pathname);
// Lab only (QA_ARIAL_SHIM=liberation): the generated metric-matched fallback faces use src:local("Arial"), which
// Chromium on a bare Linux box cannot resolve although fontconfig maps Arial to Liberation Sans (metric-compatible).
// Pointing them at Liberation Sans reproduces what visitors on Windows/macOS/iOS get with real Arial.
// Measurement only: CSP is dropped in this mode (rewritten inline styles no longer match their hashes).
const shim = process.env.QA_ARIAL_SHIM === 'liberation';
const shimArial = (html) => (shim ? html.replaceAll('local("Arial Bold")', 'local("Liberation Sans Bold")').replaceAll('local("Arial")', 'local("Liberation Sans")') : html);
const headersFor = (pathname) => {
  const out = {};
  for (const rule of config.routes) if (rule.headers && !rule.dest && !rule.status && rule.src && matches(rule, pathname)) Object.assign(out, rule.headers);
  return out;
};
const notFoundHeaders = () => config.routes.find((r) => r.dest === '/404.html' && r.status === 404)?.headers;

async function fileFor(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, join(clean, 'index.html')]) {
    const full = join(root, 'static', candidate);
    try { if ((await stat(full)).isFile()) return full; } catch { /* next */ }
  }
  return null;
}

// Vercel serves text assets Brotli-compressed; do the same so transfer sizes and timings are representative.
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt']);
function send(req, res, status, type, ext, headers, body) {
  const buffer = Buffer.from(body);
  const out = { 'Content-Type': type, ...headers };
  if (COMPRESSIBLE.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
    const packed = brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
    res.writeHead(status, { ...out, 'Content-Encoding': 'br', Vary: 'Accept-Encoding', 'Content-Length': packed.length });
    return res.end(packed);
  }
  res.writeHead(status, { ...out, 'Content-Length': buffer.length });
  return res.end(buffer);
}

// QA_TLS_KEY / QA_TLS_CERT: serve HTTP/2 over TLS (self-signed) like Vercel does; HTTP/1.1 splits bandwidth between
// parallel connections regardless of priority and so exaggerates LCP in throttled lab runs.
const tls = process.env.QA_TLS_KEY && process.env.QA_TLS_CERT ? { key: readFileSync(process.env.QA_TLS_KEY), cert: readFileSync(process.env.QA_TLS_CERT), allowHTTP1: true } : null;
const handler = async (req, res) => {
  await loadConfig();
  const { pathname } = new URL(req.url, 'http://x');
  if (!extname(pathname) && !pathname.endsWith('/')) { res.writeHead(308, { Location: `${pathname}/` }); return res.end(); }
  const file = await fileFor(pathname);
  const headers = file ? headersFor(pathname) : { ...headersFor(pathname), ...notFoundHeaders() };
  // The CSP allows the inline <style> blocks by hash; rewriting them for the shim would break those hashes.
  if (shim) delete headers['content-security-policy'];
  if (!file) return send(req, res, 404, types['.html'], '.html', headers, shimArial(await readFile(join(root, 'static/404.html'), 'utf8')));
  const ext = extname(file);
  const body = ext === '.html' ? shimArial(await readFile(file, 'utf8')) : await readFile(file);
  return send(req, res, 200, types[ext] || 'application/octet-stream', ext, headers, body);
};
(tls ? http2.createSecureServer(tls, handler) : http.createServer(handler)).listen(port, () => console.log(`serving .vercel/output/static on ${tls ? 'https' : 'http'}://localhost:${port}`));
