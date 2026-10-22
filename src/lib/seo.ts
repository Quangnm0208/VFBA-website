import { PUBLIC_SITE_INDEXING } from 'astro:env/client';
import { absoluteUrl, articlePath, siteOrigin } from './url';
import { isoDate } from './format';
import type { Article, SiteSettings } from './content';

/** Search engines are kept out until PUBLIC_SITE_INDEXING=on is set for the production launch. */
export const indexingEnabled = (): boolean => PUBLIC_SITE_INDEXING === 'on';

export const DEFAULT_OG = { path: '/og-default.png', width: 1200, height: 630 } as const;

type JsonLd = Record<string, unknown>;

export function organizationJsonLd(site: SiteSettings): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteOrigin()}/#organization`,
    name: site.legalName,
    alternateName: [site.englishName, site.name],
    url: siteOrigin(),
    logo: absoluteUrl('/favicon-512.png'),
    ...(site.social.length ? { sameAs: site.social } : {}),
    ...(site.contact.email || site.contact.phone
      ? { contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: site.contact.email, telephone: site.contact.phone, areaServed: 'VN', availableLanguage: 'vi' } }
      : {}),
    ...(site.contact.address ? { address: { '@type': 'PostalAddress', streetAddress: site.contact.address, addressCountry: 'VN' } } : {}),
  };
}

export const websiteJsonLd = (site: SiteSettings): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${siteOrigin()}/#website`,
  url: siteOrigin(),
  name: `${site.name} | ${site.legalName}`,
  inLanguage: 'vi',
  publisher: { '@id': `${siteOrigin()}/#organization` },
});

export function articleJsonLd(article: Article): JsonLd {
  const url = absoluteUrl(articlePath(article.slug));
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: article.title,
    description: article.excerpt,
    datePublished: isoDate(article.publishedAt),
    dateModified: isoDate(article.updatedAt ?? article.publishedAt),
    inLanguage: 'vi',
    image: [article.seo.ogImage?.src ?? article.cover.src].map(absoluteUrl),
    author: { '@id': `${siteOrigin()}/#organization` },
    publisher: { '@id': `${siteOrigin()}/#organization` },
  };
}

export const breadcrumbJsonLd = (items: Array<{ name: string; path: string }>): JsonLd => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: absoluteUrl(item.path) })),
});

/** Safe to embed inside <script type="application/ld+json">. */
export const serializeJsonLd = (data: JsonLd): string => JSON.stringify(data).replace(/</g, '\\u003c');
