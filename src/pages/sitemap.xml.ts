import type { APIRoute } from 'astro';
import { isoDate } from '~/lib/format';
import { absoluteUrl, articlePath, pagePath } from '~/lib/url';
import { getContent } from '~/lib/content';

export const prerender = true;

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Generated from the CMS so every URL carries its real last-modified date and `noIndex` pages are left out. */
export const GET: APIRoute = async () => {
  const { articles, pages, home, newsPage } = await getContent();
  const latest = articles.map((a) => a.updatedAt ?? a.publishedAt).sort().at(-1);
  const urls: Array<{ loc: string; lastmod?: string }> = [
    ...(home.seo.noIndex ? [] : [{ loc: absoluteUrl('/'), lastmod: latest && isoDate(latest) }]),
    ...(newsPage.seo.noIndex ? [] : [{ loc: absoluteUrl('/tin-tuc/'), lastmod: latest && isoDate(latest) }]),
    ...articles.filter((a) => !a.seo.noIndex).map((a) => ({ loc: absoluteUrl(articlePath(a.slug)), lastmod: isoDate(a.updatedAt ?? a.publishedAt) })),
    ...pages.filter((p) => !p.seo.noIndex).map((p) => ({ loc: absoluteUrl(pagePath(p.slug)), lastmod: p.updatedAt ? isoDate(p.updatedAt) : undefined })),
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
