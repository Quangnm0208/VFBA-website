#!/usr/bin/env node
/**
 * Plain HTTP host for the BUNDLED portal Function (<harness-dir>/portal.mjs, built by studio/scripts/bundle-portal.mjs: the same bundle
 * Vercel runs as a Node (req, res) function) plus the static QA harness, on one origin like Vercel. Like Vercel's edge it sets
 * x-forwarded-proto (here http: the QA origin is plain http).
 *   node --import scripts/qa/portal-fake-sanity.mjs scripts/qa/portal-host.mjs <harness-dir>
 * Prints HOST_READY <port>. Used by portal-browser.mjs (local, emulated Sanity) - never by anything deployed.
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.argv[2] ?? 'qa-artifacts/portal-harness');
const { default: listener } = await import(pathToFileURL(join(dir, 'portal.mjs')).href);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/portal') {
      req.headers['x-forwarded-proto'] = 'http';
      return await listener(req, res);
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (file.includes('..') || file === 'portal.mjs') throw new Error('bad path');
    const data = await readFile(join(dir, file));
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, '127.0.0.1', () => console.log(`HOST_READY ${server.address().port}`));
