import { describe, expect, it, vi } from 'vitest';
import { missingSlugs, run, slugsFromSearchIndex } from './scheduled-publish.mjs';

/** Decision logic and call sequence against a stubbed fetch: no network, no real Sanity project, no real Deploy Hook. */
const HOOK = 'https://api.vercel.com/v1/integrations/deploy/prj_example/secret-token-value';
const baseEnv = { SITE_BASE_URL: 'https://example.vercel.app', VERCEL_DEPLOY_HOOK_URL: HOOK };

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const index = (...slugs) => ({ pages: [['Trang chủ', '/#top']], articles: slugs.map((s) => [`Bài ${s}`, `/tin-tuc/${s}/`]) });

function stub({ due, live, hook = json({ job: { id: 'job_123' } }), sanity, site }) {
  return vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('.api.sanity.io')) return sanity ?? json({ result: due });
    if (u.endsWith('/search-index.json')) return site ?? json(live);
    if (u === HOOK) return hook;
    throw new Error(`unexpected request: ${u}`);
  });
}

describe('slugsFromSearchIndex / missingSlugs', () => {
  it('reads article slugs only and ignores everything else', () => {
    expect(slugsFromSearchIndex({ articles: [['A', '/tin-tuc/a-b/'], ['B', '/tin-tuc/'], ['C', '/x/y/'], null] })).toEqual(['a-b']);
    expect(slugsFromSearchIndex(undefined)).toEqual([]);
  });

  it('lists due articles that are not served, once each and sorted', () => {
    expect(missingSlugs(['b', 'a', 'a', 'c'], ['c'])).toEqual(['a', 'b']);
    expect(missingSlugs([], ['c'])).toEqual([]);
  });
});

describe('run', () => {
  it('does nothing when the site already serves every due article', async () => {
    const fetchImpl = stub({ due: ['a', 'b'], live: index('a', 'b', 'old-unpublished-one') });
    const out = await run({ env: baseEnv, fetchImpl, log: () => {} });
    expect(out).toEqual({ triggered: false, missing: [] });
    expect(fetchImpl.mock.calls.some(([url]) => url === HOOK)).toBe(false);
  });

  it('calls the Deploy Hook exactly once when an article became due', async () => {
    const fetchImpl = stub({ due: ['a', 'b'], live: index('a') });
    const logs = [];
    const out = await run({ env: baseEnv, fetchImpl, log: (m) => logs.push(m) });
    expect(out).toEqual({ triggered: true, missing: ['b'] });
    const hookCalls = fetchImpl.mock.calls.filter(([url]) => url === HOOK);
    expect(hookCalls).toHaveLength(1);
    expect(hookCalls[0][1]).toEqual({ method: 'POST' });
    expect(logs.join('\n')).toContain('job job_123');
  });

  it('never prints the hook URL or any part of its token', async () => {
    const logs = [];
    await run({ env: baseEnv, fetchImpl: stub({ due: ['b'], live: index() }), log: (m) => logs.push(m) });
    expect(logs.join('\n')).not.toMatch(/secret-token-value|integrations\/deploy/);
  });

  it('reports but does not call the hook in a dry run, and needs no hook URL', async () => {
    const fetchImpl = stub({ due: ['b'], live: index() });
    const out = await run({ env: { SITE_BASE_URL: 'https://example.vercel.app', DRY_RUN: '1' }, fetchImpl, log: () => {} });
    expect(out).toEqual({ triggered: false, missing: ['b'] });
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes('api.vercel.com'))).toBe(true);
  });

  it('queries the published perspective of the configured dataset and sends the protection bypass only to the site', async () => {
    const fetchImpl = stub({ due: [], live: index() });
    await run({ env: { ...baseEnv, SANITY_PROJECT_ID: 'p1', SANITY_DATASET: 'd1', VERCEL_PROTECTION_BYPASS: 'bypass-value' }, fetchImpl, log: () => {} });
    const [sanityUrl, sanityInit] = fetchImpl.mock.calls[0];
    expect(String(sanityUrl)).toMatch(/^https:\/\/p1\.api\.sanity\.io\/v2026-10-01\/data\/query\/d1\?perspective=published&query=/);
    expect(JSON.stringify(sanityInit)).not.toContain('bypass-value');
    const [, siteInit] = fetchImpl.mock.calls[1];
    expect(siteInit.headers['x-vercel-protection-bypass']).toBe('bypass-value');
  });

  it.each([
    ['Sanity answers with an error', { due: [], live: index(), sanity: json({}, 500) }, /Sanity query: HTTP 500/],
    ['Sanity answers with an unexpected shape', { due: [], live: index(), sanity: json({ nope: 1 }) }, /unexpected response shape/],
    ['the live site cannot be read', { due: ['a'], live: index(), site: json({}, 401) }, /Live site search index: HTTP 401/],
  ])('fails without calling the hook when %s', async (_name, setup, message) => {
    const fetchImpl = stub(setup);
    await expect(run({ env: baseEnv, fetchImpl, log: () => {} })).rejects.toThrow(message);
    expect(fetchImpl.mock.calls.some(([url]) => url === HOOK)).toBe(false);
  });

  it('fails when the Deploy Hook itself answers with an error', async () => {
    await expect(run({ env: baseEnv, fetchImpl: stub({ due: ['b'], live: index(), hook: json({}, 404) }), log: () => {} })).rejects.toThrow(/Deploy Hook: HTTP 404/);
  });

  it('rejects a bad configuration before any request', async () => {
    const fetchImpl = vi.fn();
    await expect(run({ env: { SITE_BASE_URL: 'http://insecure.example', VERCEL_DEPLOY_HOOK_URL: HOOK }, fetchImpl })).rejects.toThrow(/https origin/);
    await expect(run({ env: { SITE_BASE_URL: 'https://example.vercel.app', VERCEL_DEPLOY_HOOK_URL: 'https://evil.example/hook' }, fetchImpl })).rejects.toThrow(/not a Vercel Deploy Hook/);
    await expect(run({ env: { SITE_BASE_URL: 'https://example.vercel.app' }, fetchImpl })).rejects.toThrow(/Deploy Hook URL is missing|VERCEL_DEPLOY_HOOK_URL is missing/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
