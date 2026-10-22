import { describe, expect, it } from 'vitest';
import { fixCspRoutes, routeMatches } from './finalize-vercel-output.mjs';

const csp = { 'content-security-policy': "default-src 'self'" };
const adapterOutput = () => ({
  version: 3,
  routes: [
    { src: '^/_astro(?:/(.*))$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '/404', headers: csp },
    { src: '/tin-tuc/bai-viet/', headers: csp },
    { src: '/tin-tuc', headers: csp },
    { src: '/', headers: csp },
    { handle: 'filesystem' },
    { src: '^/api/join/$', dest: '_render' },
    { src: '^/.*$', dest: '/404.html', status: 404 },
  ],
});
const urls = ['/', '/tin-tuc/', '/tin-tuc/bai-viet/'];

describe('fixCspRoutes', () => {
  it('anchors every page route on its trailing-slash URL', () => {
    const { routes } = fixCspRoutes(adapterOutput(), urls);
    const pageRules = routes.filter((r) => r.headers?.['content-security-policy'] && !r.dest);
    expect(pageRules.map((r) => r.src)).toEqual(['^/tin-tuc/bai-viet/$', '^/tin-tuc/$', '^/$']);
    for (const url of urls) expect(pageRules.some((r) => routeMatches(r, url))).toBe(true);
  });

  it('moves the 404 CSP onto the catch-all rule and drops the unreachable /404 route', () => {
    const { routes } = fixCspRoutes(adapterOutput(), urls);
    expect(routes.some((r) => r.src === '/404')).toBe(false);
    expect(routes.find((r) => r.dest === '/404.html').headers).toEqual(csp);
  });

  it('keeps unrelated routes untouched and is idempotent', () => {
    const once = fixCspRoutes(adapterOutput(), urls);
    expect(once.routes[0]).toEqual(adapterOutput().routes[0]);
    expect(once.routes.find((r) => r.dest === '_render').src).toBe('^/api/join/$');
    expect(fixCspRoutes(once, urls)).toEqual(once);
  });

  it('does not let a page route match a longer path', () => {
    const { routes } = fixCspRoutes(adapterOutput(), urls);
    const home = routes.find((r) => r.src === '^/$');
    expect(routeMatches(home, '/tin-tuc/')).toBe(false);
    expect(routeMatches(home, '/')).toBe(true);
  });

  it('fails when a built page has no CSP route', () => {
    expect(() => fixCspRoutes(adapterOutput(), [...urls, '/moi/'])).toThrow(/\/moi\//);
  });

  it('fails when the adapter emitted no CSP routes at all', () => {
    const config = adapterOutput();
    config.routes = config.routes.filter((r) => !r.headers?.['content-security-policy']);
    expect(() => fixCspRoutes(config, urls)).toThrow(/security\.csp/);
  });

  it('fails when the 404 response would ship without CSP', () => {
    const config = adapterOutput();
    config.routes = config.routes.filter((r) => r.src !== '/404');
    expect(() => fixCspRoutes(config, urls)).toThrow(/404 catch-all/);
  });
});
