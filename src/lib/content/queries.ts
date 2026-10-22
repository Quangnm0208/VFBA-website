/** GROQ projections. Field names mirror studio/schemaTypes (and src/lib/content/schema.ts). */
const IMAGE = `{ alt, asset, crop, hotspot }`;
const SEO = `seo{ title, description, canonicalUrl, noIndex, "ogImage": ogImage${IMAGE} }`;
const BODY = `body[]{
  ...,
  _type == "block" => { _type, _key, style, listItem, children[]{ _type, text, marks }, markDefs[]{ _key, _type, href } },
  _type == "figure" => { _type, _key, caption, "image": image${IMAGE} },
  _type == "callout" => { _type, _key, title, text }
}`;

export const SITE_QUERY = `*[_type == "siteSettings"][0]{
  name, legalName, englishName, utilityLeft, utilityRight, footerBlurb, footerContact, footerContactCta,
  newsletter, contact, social,
  forms{ joinTitle, joinIntro, consentText, consentVersion, newsletterConsentText, newsletterConsentVersion, joinSuccess, newsletterSuccess, genericError, "privacyPageSlug": privacyPage->slug.current },
  ${SEO}
}`;

export const HOME_QUERY = `*[_type == "homePage"][0]{
  hero, about, focus, membership, resources,
  news{ eyebrow, title, description, allLink, picks[]{ "slug": article->slug.current, link } },
  ${SEO}
}`;

export const NEWS_PAGE_QUERY = `*[_type == "newsPage"][0]{ eyebrow, line1, highlight, lead, ${SEO} }`;

export const ARTICLES_QUERY = `*[_type == "article" && defined(slug.current) && publishedAt <= now()] | order(publishedAt desc){
  "id": _id, "slug": slug.current, category, kicker, publishedAt, "updatedAt": _updatedAt, readingMinutes, title, excerpt,
  "cover": cover${IMAGE},
  ${BODY},
  ${SEO}
}`;

export const PAGES_QUERY = `*[_type == "page" && defined(slug.current)]{
  "id": _id, "slug": slug.current, title, intro, "updatedAt": _updatedAt,
  ${BODY},
  ${SEO}
}`;

export const POPUPS_QUERY = `*[_type == "popup" && enabled == true]{
  "id": _id, "revision": _rev, heading, body, "image": image${IMAGE}, ctaLabel, ctaAction, ctaUrl, dismissLabel,
  trigger, delaySeconds, scrollPercent, frequency, pages, startsAt, endsAt, priority
}`;
