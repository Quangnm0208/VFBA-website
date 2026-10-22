import type { APIRoute } from 'astro';
import { articlePath, pagePath } from '~/lib/url';
import { getContent } from '~/lib/content';

export const prerender = true;

/** Client-side search data (pages + articles). Built from the CMS content at deploy time. */
export const GET: APIRoute = async () => {
  const { articles, pages } = await getContent();
  const pageEntries: Array<[string, string]> = [
    ['Trang chủ', '/#top'],
    ['Giới thiệu VBFA', '/#about'],
    ['Chính sách và pháp lý', '/#focus'],
    ['Thị trường và đầu tư', '/#focus'],
    ['Công nghệ và đổi mới', '/#focus'],
    ['Phát triển bền vững', '/#focus'],
    ['Hội viên và kết nối', '/#membership'],
    ['Tin tức và hoạt động', '/tin-tuc/'],
    ['Thư viện và báo cáo', '/#resources'],
    ['Liên hệ', '/#contact'],
    ...pages.filter((p) => !p.seo.noIndex).map((p): [string, string] => [p.title, pagePath(p.slug)]),
  ];
  const body = { pages: pageEntries, articles: articles.map((a): [string, string] => [a.title, articlePath(a.slug)]) };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
