/**
 * Content model shared by the Sanity loader and the local seed.
 *
 * Every value the templates render goes through these schemas, so a malformed CMS document fails the
 * build (the previous deployment stays live) instead of publishing a broken page.
 * The Sanity document types in studio/schemaTypes mirror these shapes.
 */
import { z } from 'zod';

export const CATEGORY_KEYS = ['news', 'activity', 'policy'] as const;
export const categorySchema = z.enum(CATEGORY_KEYS);
export type Category = z.infer<typeof categorySchema>;

/** Labels and badge text per category (handoff README, "Data model"). */
export const CATEGORIES: Record<Category, { label: string; badge: string; slug: string }> = {
  news: { label: 'Tin ngành', badge: 'VBFA / INSIGHTS', slug: 'tin-nganh' },
  activity: { label: 'Hoạt động', badge: 'VBFA / COMMUNITY', slug: 'hoat-dong' },
  policy: { label: 'Chính sách', badge: 'VBFA / POLICY', slug: 'chinh-sach' },
};

/** An image that is ready to render: a Sanity Assets CDN URL or a fingerprinted local asset. */
export const mediaSchema = z.object({
  src: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().default(''),
  srcset: z.string().optional(),
});
export type Media = z.infer<typeof mediaSchema>;

export const seoSchema = z
  .object({
    title: z.string().max(120).optional(),
    description: z.string().max(320).optional(),
    canonicalUrl: z.url().optional(),
    ogImage: mediaSchema.optional(),
    noIndex: z.boolean().default(false),
  })
  .default({ noIndex: false });
export type Seo = z.infer<typeof seoSchema>;

/* ---------- Portable text (restricted on purpose: only styles that exist in the design) ---------- */
const spanSchema = z.object({ _type: z.literal('span'), text: z.string(), marks: z.array(z.string()).default([]) });
const markDefSchema = z.object({ _key: z.string(), _type: z.literal('link'), href: z.string() });
const blockSchema = z.object({
  _type: z.literal('block'),
  style: z.enum(['normal', 'h2']).default('normal'),
  listItem: z.literal('bullet').optional(),
  children: z.array(spanSchema),
  markDefs: z.array(markDefSchema).default([]),
});
const figureSchema = z.object({ _type: z.literal('figure'), media: mediaSchema, caption: z.string().optional() });
const calloutSchema = z.object({ _type: z.literal('callout'), title: z.string().default('ĐIỂM CHÍNH'), text: z.string() });
export const bodySchema = z.array(z.discriminatedUnion('_type', [blockSchema, figureSchema, calloutSchema]));
export type PortableBody = z.infer<typeof bodySchema>;
export type PortableBlock = z.infer<typeof blockSchema>;

/* ---------- Article ---------- */
export const articleSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: categorySchema,
  /** Uppercase sub-label, e.g. "TIN NGÀNH · GÓC NHÌN". */
  kicker: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string().optional(),
  readingMinutes: z.number().int().positive(),
  title: z.string().min(8),
  excerpt: z.string().min(10),
  cover: mediaSchema,
  body: bodySchema,
  seo: seoSchema,
});
export type Article = z.infer<typeof articleSchema>;

/* ---------- Generic page (privacy policy, terms, ...) ---------- */
export const pageSchema = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string(),
  intro: z.string().optional(),
  body: bodySchema,
  updatedAt: z.string().optional(),
  seo: seoSchema,
});
export type SitePage = z.infer<typeof pageSchema>;

/* ---------- Site settings (singleton) ---------- */
export const siteSchema = z.object({
  name: z.string(),
  legalName: z.string(),
  englishName: z.string(),
  utilityLeft: z.string(),
  utilityRight: z.string(),
  footerBlurb: z.string(),
  footerContact: z.string(),
  footerContactCta: z.string(),
  newsletter: z.object({ title: z.string(), description: z.string(), placeholder: z.string(), button: z.string() }),
  contact: z.object({ email: z.string().optional(), phone: z.string().optional(), address: z.string().optional() }).default({}),
  social: z.array(z.url()).default([]),
  forms: z.object({
    joinTitle: z.string(),
    joinIntro: z.string(),
    consentText: z.string(),
    consentVersion: z.string(),
    joinSuccess: z.string(),
    newsletterSuccess: z.string(),
    genericError: z.string(),
    /** Slug of the page shown as "Chính sách bảo mật"; the consent line only links to it when set. */
    privacyPageSlug: z.string().optional(),
  }),
  seo: seoSchema,
});
export type SiteSettings = z.infer<typeof siteSchema>;

/* ---------- Home page (singleton) ---------- */
const linkSchema = z.object({ label: z.string(), href: z.string() });
export const ICON_KEYS = ['scales', 'chart', 'flask', 'sprout', 'book', 'globe', 'document'] as const;
export const iconSchema = z.enum(ICON_KEYS);
export type IconKey = z.infer<typeof iconSchema>;

export const homeSchema = z.object({
  hero: z.object({
    eyebrow: z.string(),
    line1: z.string(),
    line2Prefix: z.string(),
    highlight: z.string(),
    lead: z.string(),
    primaryCta: linkSchema,
    secondaryCta: linkSchema,
    microLabel: z.string(),
    stripLabel: z.string(),
    stripScript: z.string(),
    stripPoints: z.array(z.string()).length(3),
    stripCue: z.string(),
  }),
  about: z.object({
    eyebrow: z.string(),
    title: z.string(),
    link: linkSchema,
    lead: z.string(),
    rows: z.array(linkSchema).length(3),
  }),
  focus: z.object({
    eyebrow: z.string(),
    title: z.string(),
    description: z.string(),
    kickerPrefix: z.string(),
    cards: z.array(z.object({ title: z.string(), description: z.string(), icon: iconSchema, href: z.string() })).min(1).max(12),
  }),
  news: z.object({
    eyebrow: z.string(),
    title: z.string(),
    description: z.string(),
    allLink: linkSchema,
    /** Up to three highlighted articles: supports a new CMS with only one published article. */
    picks: z.array(z.object({ slug: z.string(), link: linkSchema })).min(1).max(3),
  }),
  membership: z.object({
    eyebrow: z.string(),
    title: z.string(),
    description: z.string(),
    cta: z.string(),
    points: z.array(z.object({ title: z.string(), description: z.string() })).length(3),
    signature: z.string(),
  }),
  resources: z.object({
    eyebrow: z.string(),
    titleLines: z.array(z.string()).min(1).max(2),
    description: z.string(),
    cards: z
      .array(z.object({ kicker: z.string(), title: z.string(), description: z.string(), icon: iconSchema, ariaLabel: z.string(), href: z.string() }))
      .length(2),
    band: z.string(),
  }),
  seo: seoSchema,
});
export type HomeContent = z.infer<typeof homeSchema>;

/* ---------- News listing page (singleton) ---------- */
export const newsPageSchema = z.object({
  eyebrow: z.string(),
  /** H1 is two animated lines: the plain first line and the highlighted second line. */
  line1: z.string(),
  highlight: z.string(),
  lead: z.string(),
  seo: seoSchema,
});
export type NewsPageContent = z.infer<typeof newsPageSchema>;

/* ---------- Pop-up ---------- */
export const POPUP_PAGES = ['home', 'news', 'article', 'page'] as const;
export const popupSchema = z.object({
  id: z.string(),
  /** Changes whenever the editor republishes, so a dismissed pop-up can return after an update. */
  revision: z.string(),
  heading: z.string().max(90),
  body: z.string().max(400).optional(),
  image: mediaSchema.optional(),
  ctaLabel: z.string().max(40).optional(),
  ctaAction: z.enum(['join', 'link', 'none']).default('none'),
  ctaUrl: z.string().optional(),
  dismissLabel: z.string().default('Để sau'),
  trigger: z.enum(['delay', 'scroll', 'exit']).default('delay'),
  delaySeconds: z.number().int().min(3).max(120).default(10),
  scrollPercent: z.number().int().min(10).max(90).default(50),
  frequency: z.enum(['session', 'daily', 'weekly', 'once']).default('weekly'),
  pages: z.array(z.enum(POPUP_PAGES)).default(['home']),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  priority: z.number().int().default(0),
});
export type Popup = z.infer<typeof popupSchema>;

export interface SiteContent {
  source: 'sanity' | 'seed';
  site: SiteSettings;
  home: HomeContent;
  newsPage: NewsPageContent;
  articles: Article[];
  pages: SitePage[];
  popups: Popup[];
}
