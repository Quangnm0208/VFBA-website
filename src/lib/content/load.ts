import { z } from 'zod';
import {
  articleSchema,
  homeSchema,
  newsPageSchema,
  pageSchema,
  popupSchema,
  siteSchema,
  type Article,
  type HomeContent,
  type NewsPageContent,
  type PortableBody,
  type Seo,
  type SitePage,
  type SiteSettings,
} from './schema';
import { sanityClient, toMedia, type SanityImageValue } from './sanity';
import { ARTICLES_QUERY, HOME_QUERY, NEWS_PAGE_QUERY, PAGES_QUERY, POPUPS_QUERY, SITE_QUERY } from './queries';
import { homeSeed } from './seed/home';
import { newsPageSeed } from './seed/news-page';
import { siteSeed } from './seed/site';

type Json = Record<string, unknown>;

/** Sanity returns `null` for unset fields; treat them as "not provided". */
function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripNulls) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Json)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, stripNulls(v)]),
    ) as T;
  }
  return value;
}

/** Objects merge key by key; arrays and scalars from `over` replace the base value. */
function deepMerge<T extends Json>(base: T, over: Json | null | undefined): T {
  if (!over) return base;
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)
        ? deepMerge(current as Json, value as Json)
        : value;
  }
  return out as T;
}

function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid ${what} from Sanity:\n${z.prettifyError(result.error)}`);
  return result.data;
}

const mapSeo = (raw: unknown): Seo => {
  const seo = stripNulls((raw ?? {}) as Json & { ogImage?: SanityImageValue });
  return { ...seo, ogImage: toMedia(seo.ogImage, 1200) } as Seo;
};

function mapBody(raw: unknown): PortableBody {
  const blocks = Array.isArray(raw) ? raw : [];
  return blocks
    .filter((b) => b && typeof b === 'object')
    .map((b: Json) => {
      if (b._type === 'figure') {
        const media = toMedia(b.image as SanityImageValue, 1600);
        return media ? { _type: 'figure', media, caption: (b.caption as string | null) ?? undefined } : null;
      }
      return stripNulls(b);
    })
    .filter(Boolean) as PortableBody;
}

const wordCount = (body: PortableBody) =>
  body.reduce((n, b) => n + (b._type === 'block' ? b.children.map((c) => c.text).join(' ').split(/\s+/).filter(Boolean).length : 0), 0);

function mapArticle(raw: Json): Article {
  const body = mapBody(raw.body);
  const cover = toMedia(raw.cover as SanityImageValue, 1600);
  const draft = {
    ...stripNulls(raw),
    cover,
    body,
    seo: mapSeo(raw.seo),
    readingMinutes: (raw.readingMinutes as number | null) ?? Math.max(1, Math.round(wordCount(body) / 200)),
    kicker: (raw.kicker as string | null) ?? '',
  };
  return parse(articleSchema, draft, `article "${String(raw.slug)}"`);
}

function mapPage(raw: Json): SitePage {
  return parse(pageSchema, { ...stripNulls(raw), body: mapBody(raw.body), seo: mapSeo(raw.seo) }, `page "${String(raw.slug)}"`);
}

export async function loadFromSanity() {
  const client = sanityClient();
  const [site, home, newsPageRaw, articlesRaw, pagesRaw, popupsRaw] = await Promise.all([
    client.fetch<Json | null>(SITE_QUERY),
    client.fetch<Json | null>(HOME_QUERY),
    client.fetch<Json | null>(NEWS_PAGE_QUERY),
    client.fetch<Json[]>(ARTICLES_QUERY),
    client.fetch<Json[]>(PAGES_QUERY),
    client.fetch<Json[]>(POPUPS_QUERY),
  ]);

  // An empty dataset (project connected, seed not imported yet) would otherwise fail much later with a confusing
  // "Invalid homePage" message. Say what to do instead.
  if (!articlesRaw.length) {
    throw new Error(
      'Sanity returned no published articles. Import the seed first (docs/OPERATIONS.md section A.5: `npm run seed:export`, then `sanity dataset import seed/seed.ndjson production --missing`) or Publish content, then build again. To build from the local sample content instead, leave PUBLIC_SANITY_PROJECT_ID empty.',
    );
  }
  const articles = articlesRaw.map(mapArticle);
  const pages = pagesRaw.map(mapPage);

  const siteMerged = deepMerge(siteSeed as unknown as Json, stripNulls({ ...site, seo: mapSeo(site?.seo) }) as Json);
  const siteContent: SiteSettings = parse(siteSchema, siteMerged, 'siteSettings');
  if (siteContent.forms.privacyPageSlug && !pages.some((p) => p.slug === siteContent.forms.privacyPageSlug)) {
    delete siteContent.forms.privacyPageSlug;
  }

  const homeRaw = stripNulls({ ...home, seo: mapSeo(home?.seo) }) as Json & { news?: { picks?: Array<{ slug?: string; link?: unknown }> } };
  if (homeRaw.news?.picks) {
    homeRaw.news.picks = homeRaw.news.picks.filter((p) => p.slug && articles.some((a) => a.slug === p.slug));
  }
  const homeMerged = deepMerge(homeSeed as unknown as Json, homeRaw as Json) as unknown as HomeContent;
  // Fewer than three valid picks: complete the set with the newest articles (never fail the build for an editorial gap).
  // Filter again after the merge: when the Sanity home document has no picks, the seed's picks apply, and they may name
  // sample articles that do not exist in the real dataset (NewsPreview resolves every pick to an article).
  const picks = (homeMerged.news.picks ?? []).filter((p) => articles.some((a) => a.slug === p.slug));
  for (const a of articles) {
    if (picks.length >= 3) break;
    if (!picks.some((p) => p.slug === a.slug)) picks.push({ slug: a.slug, link: homeSeed.news.picks[picks.length]?.link ?? homeSeed.news.allLink });
  }
  homeMerged.news = { ...homeMerged.news, picks: picks.slice(0, 3) };
  const homeContent: HomeContent = parse(homeSchema, homeMerged, 'homePage');

  const newsPage: NewsPageContent = parse(
    newsPageSchema,
    deepMerge(newsPageSeed as unknown as Json, stripNulls({ ...newsPageRaw, seo: mapSeo(newsPageRaw?.seo) }) as Json),
    'newsPage',
  );

  const popups = popupsRaw.map((raw) =>
    parse(popupSchema, { ...stripNulls(raw), image: toMedia(raw.image as SanityImageValue, 800) }, `popup "${String(raw.id)}"`),
  );

  return { source: 'sanity' as const, site: siteContent, home: homeContent, newsPage, articles, pages, popups };
}
