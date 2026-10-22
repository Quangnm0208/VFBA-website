import { describe, expect, it } from 'vitest';
import { articleJsonLd, breadcrumbJsonLd, organizationJsonLd, serializeJsonLd, websiteJsonLd } from './seo';
import { getContent } from './content';

describe('structured data', async () => {
  const { site, articles } = await getContent();

  it('describes the organisation and the website', () => {
    expect(organizationJsonLd(site)).toMatchObject({ '@type': 'Organization', name: 'Hiệp hội Nhiên liệu Sinh học Việt Nam' });
    expect(websiteJsonLd(site)).toMatchObject({ '@type': 'WebSite', inLanguage: 'vi' });
  });

  it('builds a NewsArticle with ISO dates and absolute image URLs', () => {
    const ld = articleJsonLd(articles[0]!) as Record<string, unknown>;
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.datePublished).toBe('2026-10-21');
    expect(String((ld.image as string[])[0])).toMatch(/^https?:\/\//);
  });

  it('builds breadcrumbs with absolute URLs', () => {
    const ld = breadcrumbJsonLd([{ name: 'Trang chủ', path: '/' }, { name: 'Tin tức', path: '/tin-tuc/' }]) as { itemListElement: Array<{ item: string; position: number }> };
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(ld.itemListElement[1]!.item).toMatch(/\/tin-tuc\/$/);
  });

  it('escapes "<" so editor content can never close the script tag', () => {
    expect(serializeJsonLd({ headline: '</script><b>' })).not.toContain('</script>');
  });
});
