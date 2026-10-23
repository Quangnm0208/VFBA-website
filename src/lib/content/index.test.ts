import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Content source policy. With a CMS project configured the Content Lake is the only source (load.test.ts); without one the
 * built-in SAMPLE articles are allowed for development and Preview, but a Production build must refuse to publish them as news.
 */
vi.mock('./sanity', () => ({ sanityConfigured: () => false, sanityClient: () => ({}), toMedia: () => undefined }));

const original = process.env.VERCEL_ENV;

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (original === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = original;
});

describe('getContent without a CMS project', () => {
  it('refuses a Production build instead of publishing sample articles', async () => {
    process.env.VERCEL_ENV = 'production';
    const { getContent } = await import('./index');
    await expect(getContent()).rejects.toThrow(/Production build refused.*PUBLIC_SANITY_PROJECT_ID.*SAMPLE/s);
  });

  it.each(['preview', 'development', undefined])('keeps the sample set for %s builds and says so in the build log', async (env) => {
    if (env === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = env;
    const { getContent } = await import('./index');
    const content = await getContent();
    expect(content.source).toBe('seed');
    expect(content.articles.length).toBeGreaterThan(0);
    expect(vi.mocked(console.warn).mock.calls.flat().join(' ')).toMatch(/SAMPLE content/);
  });
});
