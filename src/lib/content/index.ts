import { articlesSeed } from './seed/articles';
import { homeSeed } from './seed/home';
import { newsPageSeed } from './seed/news-page';
import { popupSeed } from './seed/popups';
import { siteSeed } from './seed/site';
import { sanityConfigured } from './sanity';
import { loadFromSanity } from './load';
import { articleSchema, homeSchema, newsPageSchema, siteSchema, type Article, type SiteContent } from './schema';

export * from './schema';

let cached: Promise<SiteContent> | undefined;

/**
 * Single content entry point for every page.
 *  - Sanity configured  -> Content Lake only. A failed request or invalid document FAILS THE BUILD, so the
 *    last good deployment stays live instead of shipping sample text.
 *  - Sanity not configured -> the local seed (dev, previews, very first deploy).
 */
export function getContent(): Promise<SiteContent> {
  return (cached ??= sanityConfigured()
    ? loadFromSanity()
    : Promise.resolve({
        source: 'seed' as const,
        site: siteSchema.parse(siteSeed),
        home: homeSchema.parse(homeSeed),
        newsPage: newsPageSchema.parse(newsPageSeed),
        articles: articlesSeed.map((a) => articleSchema.parse(a)),
        pages: [],
        popups: popupSeed,
      }));
}

/** Newer neighbour = "Bài trước", older neighbour = "Bài sau" (list is newest first). */
export function getNeighbours(articles: Article[], slug: string) {
  const i = articles.findIndex((a) => a.slug === slug);
  return { prev: i > 0 ? articles[i - 1] : undefined, next: i >= 0 ? articles[i + 1] : undefined };
}

/** Same category first, then the rest, current article excluded, max three. */
export function getRelated(articles: Article[], current: Article, max = 3): Article[] {
  const others = articles.filter((a) => a.slug !== current.slug);
  return [...others.filter((a) => a.category === current.category), ...others.filter((a) => a.category !== current.category)].slice(0, max);
}
