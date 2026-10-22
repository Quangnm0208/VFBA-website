import { PUBLIC_SITE_URL } from 'astro:env/client';

/** Origin used for canonical URLs, OG tags and the sitemap. */
export const siteOrigin = (): string => (PUBLIC_SITE_URL || import.meta.env.SITE || 'http://localhost:4321').replace(/\/+$/, '');

export const absoluteUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
};

export const articlePath = (slug: string): string => `/tin-tuc/${slug}/`;
export const pagePath = (slug: string): string => `/${slug}/`;
