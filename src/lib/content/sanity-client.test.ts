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
    expect(createClient.mock.calls[0]![0]).toMatchObject({ projectId: 'iqyx5ttc', dataset: 'production', apiVersion: '2026-10-01', useCdn: false, perspective: 'published' });
  });

  it('is created once and reused', async () => {
    const { sanityClient } = await import('./sanity');
    expect(sanityClient()).toBe(sanityClient());
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
