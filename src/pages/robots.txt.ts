import type { APIRoute } from 'astro';
import { indexingEnabled } from '~/lib/seo';
import { absoluteUrl } from '~/lib/url';

export const prerender = true;

/** Crawlers are blocked until PUBLIC_SITE_INDEXING=on (production launch). */
export const GET: APIRoute = () => {
  const body = indexingEnabled()
    ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n\nSitemap: ${absoluteUrl('/sitemap.xml')}\n`
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
