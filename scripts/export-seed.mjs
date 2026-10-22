#!/usr/bin/env node
/**
 * Exports the site's seed content (src/lib/content/seed) as a Sanity NDJSON import file, so the first Studio
 * session starts from exactly what the website shows today.
 *
 *   npm run seed:export
 *   cd studio && npx sanity dataset import seed/seed.ndjson production --missing
 *
 * `--missing` only creates documents whose _id does not exist yet, so re-running never overwrites editors' work.
 * Images are referenced by absolute file:// path and are uploaded by the import (Sanity Assets CDN).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createServer } from 'vite';
import { getViteConfig } from 'astro/config';

const root = fileURLToPath(new URL('..', import.meta.url));
const viteConfig = await getViteConfig({})({ command: 'serve', mode: 'development' });
const server = await createServer({ ...viteConfig, root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });

try {
  const { getContent } = await server.ssrLoadModule('/src/lib/content/index.ts');
  const content = await getContent();
  if (content.source !== 'seed') throw new Error('Unset PUBLIC_SANITY_PROJECT_ID before exporting: this exports the local seed.');

  // Vite serves local images as "/@fs/<abs path>?..." or "/src/...?..." — recover the file on disk.
  const fileOf = (src) => {
    const clean = src.split('?')[0];
    return clean.startsWith('/@fs/') ? clean.slice(4) : join(root, clean);
  };
  const image = (media) => ({ _type: 'image', alt: media.alt, asset: { _type: 'reference', _sanityAsset: `image@file://${fileOf(media.src)}` } });
  const key = (prefix, i) => `${prefix}${i}`;
  const cta = (link) => ({ _type: 'cta', label: link.label, href: link.href });
  const seo = (s) => (s && (s.title || s.description) ? { _type: 'seo', title: s.title, description: s.description } : undefined);

  const body = (blocks, slug) =>
    blocks.map((b, i) => {
      const _key = key(`${slug.slice(0, 6)}b`, i);
      if (b._type === 'figure') return { _type: 'figure', _key, image: image(b.media), caption: b.caption };
      if (b._type === 'callout') return { _type: 'callout', _key, title: b.title, text: b.text };
      return {
        _type: 'block', _key, style: b.style, ...(b.listItem ? { listItem: b.listItem, level: 1 } : {}),
        markDefs: b.markDefs,
        children: b.children.map((c, j) => ({ _type: 'span', _key: `${_key}s${j}`, text: c.text, marks: c.marks })),
      };
    });

  const { site, home, newsPage, articles } = content;
  const docs = [];

  for (const a of articles) {
    docs.push({
      _id: `article-${a.slug}`, _type: 'article', title: a.title, slug: { _type: 'slug', current: a.slug }, excerpt: a.excerpt,
      category: a.category, kicker: a.kicker, publishedAt: a.publishedAt, readingMinutes: a.readingMinutes,
      cover: image(a.cover), body: body(a.body, a.slug),
    });
  }

  const { seo: siteSeo, ...siteRest } = site;
  docs.push({ _id: 'siteSettings', _type: 'siteSettings', ...siteRest, seo: seo(siteSeo) });

  docs.push({
    _id: 'newsPage', _type: 'newsPage', eyebrow: newsPage.eyebrow, line1: newsPage.line1, highlight: newsPage.highlight, lead: newsPage.lead, seo: seo(newsPage.seo),
  });

  const { seo: homeSeo, ...h } = home;
  docs.push({
    _id: 'homePage', _type: 'homePage',
    hero: { ...h.hero, primaryCta: cta(h.hero.primaryCta), secondaryCta: cta(h.hero.secondaryCta) },
    about: { ...h.about, link: cta(h.about.link), rows: h.about.rows.map((r, i) => ({ ...cta(r), _key: key('ar', i) })) },
    focus: { ...h.focus, cards: h.focus.cards.map((c, i) => ({ _type: 'focusCard', _key: key('fc', i), ...c })) },
    news: {
      ...h.news, allLink: cta(h.news.allLink),
      picks: h.news.picks.map((p, i) => ({ _type: 'newsPick', _key: key('np', i), article: { _type: 'reference', _ref: `article-${p.slug}` }, link: cta(p.link) })),
    },
    membership: { ...h.membership, points: h.membership.points.map((p, i) => ({ _type: 'point', _key: key('mp', i), ...p })) },
    resources: { ...h.resources, cards: h.resources.cards.map((c, i) => ({ _type: 'resourceCard', _key: key('rc', i), ...c })) },
    seo: seo(homeSeo),
  });

  await mkdir(join(root, 'studio/seed'), { recursive: true });
  const out = join(root, 'studio/seed/seed.ndjson');
  await writeFile(out, docs.map((d) => JSON.stringify(d)).join('\n') + '\n');
  console.log(`Wrote ${docs.length} documents to ${out}`);
} finally {
  await server.close();
}
// Astro's Vite plugin keeps a background worker alive for a moment after close(); the file is already written.
process.exit(0);
