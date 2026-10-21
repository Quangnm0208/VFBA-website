# VBFA Architecture, Delivery and Release Gates

## Decision record (2026-10-21)
**Astro SSR (Vercel)** + **Sanity public published content** + **Supabase private leads**. Sanity Studio hosted separately by Sanity. Do not build a separate WordPress/MySQL/CMS service.

## Sanity content ownership
- `siteSettings`: organization name, verified contacts, logo, SEO defaults, social profiles
- `homePage`: hero text, summary, CTAs
- `focusArea`: industry focus cards
- `article`: category, excerpt, hero, body, publish date
- `event`: association activities and event details
- `resource`: category, document download or external official link
- `partner`: ONLY verified published partners; none fabricated

Editorial chain: draft → internal review → publish. Official policy statements need client confirmation. Future locale: Vietnamese primary, optional English.

## Database
Use Supabase exclusively for inquiries/newsletter consents. No browser table credentials. Disable public table privileges, use service-role server-only, rate limit at edge/WAF, add verified anti-bot, and define retention/deletion procedure with client.

## Deployment environments
1. `feat/astro-sanity-v1` branch: live Vercel Preview once project access is restored.
2. Marketing UAT using Vercel feedback.
3. Client approvals on copy, images, legal/privacy text and member CTA.
4. Merge and promote ONLY after UAT.
5. Add production domain; verify DNS, certificates, redirect, canonical URL, Sanity Studio CORS and Turnstile, and test forms.

## Definition of Done
- Actual accessible HTTPS Vercel URL, verified build and smoke tests
- Studio owner/invitees can edit real Sanity documents without developer
- Submitted opt-in stored once with consent + anti-bot verification
- 320/375/390/430/768/1024/1440 tested; keyboard and reduced-motion QA
- SEO metadata, privacy/consent, asset rights and real contacts approved
- UAT signoff before production domain

## Blockers at branch creation
- No authenticated Sanity connector/project ID supplied.
- Existing Vercel connector lacks access to `quangnm` team (HTTP 403).
- No dedicated VBFA Supabase project authorized/created.
- Formal brand imagery, media licenses and client contact data remain pending.
- Browser-level and Lighthouse QA not yet completed.
