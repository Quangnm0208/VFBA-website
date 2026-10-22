import { beforeEach, describe, expect, it, vi } from 'vitest';
import { articlesSeed } from './seed/articles';
import { ARTICLES_QUERY, HOME_QUERY, NEWS_PAGE_QUERY, PAGES_QUERY, POPUPS_QUERY, SITE_QUERY } from './queries';

/**
 * The Sanity loader against a FAKE Content Lake client (no network, no project). It proves the build-time contract:
 * valid documents load, an invalid document or a failed request throws (so Vercel keeps the previous deployment), and an
 * editorial gap on the home page is repaired instead of failing the build. It does not prove the real Sanity API or
 * dataset; that is covered by the activation checklist in docs/OPERATIONS.md.
 */
const responses = new Map<string, unknown>();
const fetchMock = vi.fn(async (query: string) => {
  if (!responses.has(query)) throw new Error(`unexpected query: ${query.slice(0, 40)}`);
  const value = responses.get(query);
  if (value instanceof Error) throw value;
  return value;
});

vi.mock('./sanity', () => ({
  sanityConfigured: () => true,
  sanityClient: () => ({ fetch: fetchMock }),
  toMedia: (image: { asset?: { _ref?: string } } | null | undefined) =>
    image?.asset?._ref ? { src: 'https://cdn.sanity.io/images/p/production/x-1200x900.jpg', width: 1200, height: 900, alt: 'Ảnh thử nghiệm đủ dài' } : undefined,
}));

const { loadFromSanity } = await import('./load');

/** A raw article the way GROQ returns it (cover is an unresolved asset reference, no processed media). */
const rawArticle = (seed: (typeof articlesSeed)[number], over: Record<string, unknown> = {}) => ({
  id: seed.id,
  slug: seed.slug,
  category: seed.category,
  kicker: seed.kicker,
  publishedAt: seed.publishedAt,
  readingMinutes: seed.readingMinutes,
  title: seed.title,
  excerpt: seed.excerpt,
  cover: { asset: { _ref: 'image-abc123-1200x900-jpg' }, alt: 'Ảnh bìa thử nghiệm' },
  body: seed.body.filter((b) => b._type === 'block'),
  seo: null,
  ...over,
});

const set = (articles: unknown[]) => {
  responses.clear();
  responses.set(SITE_QUERY, null);
  responses.set(HOME_QUERY, null);
  responses.set(NEWS_PAGE_QUERY, null);
  responses.set(ARTICLES_QUERY, articles);
  responses.set(PAGES_QUERY, []);
  responses.set(POPUPS_QUERY, []);
};

beforeEach(() => {
  fetchMock.mockClear();
  set(articlesSeed.map((a) => rawArticle(a)));
});

describe('loadFromSanity (fake Content Lake)', () => {
  it('loads valid documents and fills missing singletons from the seed', async () => {
    const content = await loadFromSanity();
    expect(content.source).toBe('sanity');
    expect(content.articles).toHaveLength(articlesSeed.length);
    expect(content.home.news.picks).toHaveLength(3);
    expect(content.site.name.length).toBeGreaterThan(0);
  });

  it('fails the build on an invalid article and names it (the previous deployment stays live)', async () => {
    set([...articlesSeed.map((a) => rawArticle(a)), rawArticle(articlesSeed[0]!, { id: 'bad', slug: 'Bad-Slug' })]);
    await expect(loadFromSanity()).rejects.toThrow(/Invalid article "Bad-Slug" from Sanity/);
  });

  it('explains how to fix an empty dataset instead of failing deep in the home page schema', async () => {
    set([]);
    await expect(loadFromSanity()).rejects.toThrow(/no published articles.*seed/s);
  });

  it('fails the build on a title that is too short', async () => {
    set([rawArticle(articlesSeed[0]!, { title: 'Ngắn' })]);
    await expect(loadFromSanity()).rejects.toThrow(/Invalid article/);
  });

  it('fails the build when a request fails instead of shipping sample content', async () => {
    responses.set(ARTICLES_QUERY, new Error('Request error: connect ETIMEDOUT'));
    await expect(loadFromSanity()).rejects.toThrow(/ETIMEDOUT/);
  });

  it('never points a home pick at an article that does not exist (real slugs, no home document published yet)', async () => {
    set(articlesSeed.slice(0, 4).map((a, i) => rawArticle(a, { id: `real-${i}`, slug: `bai-that-${i}` })));
    const content = await loadFromSanity();
    expect(content.home.news.picks.map((p) => p.slug)).toEqual(['bai-that-0', 'bai-that-1', 'bai-that-2']);
  });

  it('supports a young CMS: one or two published articles give one or two home picks, never invented ones', async () => {
    for (const count of [1, 2]) {
      set(articlesSeed.slice(0, count).map((a, i) => rawArticle(a, { id: `real-${i}`, slug: i === 0 ? 'test' : `bai-thu-${i}` })));
      const content = await loadFromSanity();
      expect(content.articles).toHaveLength(count);
      expect(content.home.news.picks).toHaveLength(count);
      for (const pick of content.home.news.picks) expect(content.articles.some((a) => a.slug === pick.slug)).toBe(true);
    }
  });

  it('completes the three home picks with the newest articles when an editor unpublished a highlighted one', async () => {
    const [first, ...rest] = articlesSeed;
    set(rest.map((a) => rawArticle(a)));
    const content = await loadFromSanity();
    expect(content.articles.some((a) => a.slug === first!.slug)).toBe(false);
    expect(content.home.news.picks).toHaveLength(3);
    for (const pick of content.home.news.picks) expect(content.articles.some((a) => a.slug === pick.slug)).toBe(true);
  });
});
