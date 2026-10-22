import { describe, expect, it } from 'vitest';
import { extractHeadings } from '../article';
import { getContent, getNeighbours, getRelated, homeSchema, newsPageSchema, popupSchema, siteSchema } from './index';

describe('seed content (used when no Sanity project is configured)', async () => {
  const content = await getContent();

  it('is valid against the same schemas the Sanity loader uses', () => {
    expect(content.source).toBe('seed');
    expect(() => siteSchema.parse(content.site)).not.toThrow();
    expect(() => homeSchema.parse(content.home)).not.toThrow();
    expect(() => newsPageSchema.parse(content.newsPage)).not.toThrow();
  });

  it('has ten articles, newest first, with unique slugs', () => {
    expect(content.articles).toHaveLength(10);
    expect(new Set(content.articles.map((a) => a.slug)).size).toBe(10);
    const dates = content.articles.map((a) => Date.parse(a.publishedAt));
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it('resolves every highlighted home article', () => {
    for (const pick of content.home.news.picks) expect(content.articles.some((a) => a.slug === pick.slug)).toBe(true);
  });

  it('gives each article a cover with alt text', () => {
    for (const a of content.articles) {
      expect(a.cover.alt.length).toBeGreaterThan(10);
      expect(a.cover.width).toBeGreaterThan(0);
    }
  });
});

describe('article relations (must match the handoff behaviour)', async () => {
  const { articles } = await getContent();
  const slug = (i: number) => articles[i]!.slug;

  it('newest article has no previous and points to the next older one', () => {
    const { prev, next } = getNeighbours(articles, slug(0));
    expect(prev).toBeUndefined();
    expect(next?.slug).toBe(slug(1));
  });

  it('oldest article has no next', () => {
    expect(getNeighbours(articles, slug(9)).next).toBeUndefined();
    expect(getNeighbours(articles, slug(9)).prev?.slug).toBe(slug(8));
  });

  it('related = same category first, then others, never the current article, max three', () => {
    const related = getRelated(articles, articles[0]!);
    expect(related.map((a) => a.slug)).toEqual(['chuoi-gia-tri', 'cong-nghe-doi-moi', 'phat-trien-ben-vung-esg']);
    const policy = getRelated(articles, articles.find((a) => a.slug === 'tong-hop-chinh-sach')!);
    expect(policy.map((a) => a.slug)).toEqual(['noi-dung-chinh-sach', 'tra-cuu-thu-vien', 'dong-luc-tuong-lai']);
    for (const a of articles) expect(getRelated(articles, a).some((r) => r.slug === a.slug)).toBe(false);
  });
});

describe('extractHeadings', () => {
  it('numbers H2 blocks and makes unique ASCII ids', async () => {
    const { articles } = await getContent();
    expect(extractHeadings(articles[0]!.body)).toEqual([
      { id: 'boi-canh', text: 'Bối cảnh' },
      { id: 'nhung-diem-can-luu-y', text: 'Những điểm cần lưu ý' },
      { id: 'huong-theo-doi-tiep-theo', text: 'Hướng theo dõi tiếp theo' },
    ]);
    const dup = [
      { _type: 'block' as const, style: 'h2' as const, children: [{ _type: 'span' as const, text: 'Đồng bộ', marks: [] }], markDefs: [] },
      { _type: 'block' as const, style: 'h2' as const, children: [{ _type: 'span' as const, text: 'Đồng bộ', marks: [] }], markDefs: [] },
    ];
    expect(extractHeadings(dup).map((h) => h.id)).toEqual(['dong-bo', 'dong-bo-2']);
  });
});

describe('popup schema', () => {
  it('applies safe defaults', () => {
    const p = popupSchema.parse({ id: 'p1', revision: 'r1', heading: 'Chào mừng' });
    expect(p).toMatchObject({ trigger: 'delay', delaySeconds: 10, frequency: 'weekly', pages: ['home'], ctaAction: 'none' });
  });
  it('rejects out-of-range timing', () => {
    expect(() => popupSchema.parse({ id: 'p1', revision: 'r1', heading: 'x', delaySeconds: 1 })).toThrow();
  });
});
