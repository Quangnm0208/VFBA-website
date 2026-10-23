import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Content Lake client is created with the settings that keep unpublished content off the website:
 * only the `published` perspective (drafts are invisible) and no API CDN (a webhook-triggered build must see the
 * change it was triggered by). The @sanity/client constructor is replaced, so no network is involved.
 */
const createClient = vi.fn(() => ({ fetch: vi.fn() }));
vi.mock('@sanity/client', () => ({ createClient }));
vi.mock('astro:env/client', () => ({ PUBLIC_SANITY_PROJECT_ID: 'iqyx5ttc', PUBLIC_SANITY_DATASET: 'production', PUBLIC_SANITY_API_VERSION: '2026-10-01' }));
vi.mock('astro:env/server', () => ({ SANITY_API_READ_TOKEN: undefined }));

beforeEach(() => {
  vi.resetModules();
  createClient.mockClear();
});

describe('sanityClient', () => {
  it('reads project iqyx5ttc / production with the published perspective and without the API CDN', async () => {
    const { sanityClient, sanityConfigured } = await import('./sanity');
    expect(sanityConfigured()).toBe(true);
    sanityClient();
    expect(createClient).toHaveBeenCalledTimes(1);
    const [options] = createClient.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(options).toMatchObject({ projectId: 'iqyx5ttc', dataset: 'production', apiVersion: '2026-10-01', useCdn: false, perspective: 'published' });
  });

  it('is created once and reused', async () => {
    const { sanityClient } = await import('./sanity');
    expect(sanityClient()).toBe(sanityClient());
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('toMedia: no asset or an unreadable asset reference means "no image" (the loader then falls back to the default cover)', async () => {
    const { toMedia } = await import('./sanity');
    expect(toMedia(undefined)).toBeUndefined();
    expect(toMedia({ alt: 'only alt text, nothing uploaded' })).toBeUndefined();
    expect(toMedia({ asset: { _ref: 'not-an-image-reference' }, alt: 'x' })).toBeUndefined();
  });

  it('toMedia: a real asset reference becomes a Sanity Assets CDN URL with a srcset and the right proportions', async () => {
    const { toMedia } = await import('./sanity');
    const media = toMedia({ asset: { _ref: 'image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x1000-jpg' }, alt: 'Ảnh thử' });
    expect(media).toMatchObject({ width: 1600, height: 800, alt: 'Ảnh thử' });
    expect(media!.src).toMatch(/^https:\/\/cdn\.sanity\.io\/images\/iqyx5ttc\/production\/Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x1000\.jpg/);
    expect(media!.srcset).toContain('400w');
  });
});
