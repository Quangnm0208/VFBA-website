# VBFA Website — Astro + Sanity + Supabase
Repository: https://github.com/Quangnm0208/VFBA-website

## Architecture
- **Astro 5 + TypeScript** SSR via Vercel.
- **Sanity Studio** in `studio/` (separate hosting at `*.sanity.studio`) for articles, focus areas, resources, events, official settings and images.
- **Sanity Content Lake** for published content, fetched with GROQ; website updates without developer code changes.
- **Supabase PostgreSQL** for opt-in/contact/membership leads only; isolated VBFA project.
- **Cloudflare Turnstile** verified server-side; form returns a service-unavailable message before real backend is configured.

## Setup
```bash
npm install
cp .env.example .env
npm run dev
npm run build
```
Node.js 22 recommended. `PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET` connect the published data source. When missing, website shows only neutral, nonfactual placeholders; it does not fabricate news.

## Sanity CMS
1. VBFA owner creates a Sanity project at https://sanity.io/manage and a **public** `production` dataset.
2. Copy `studio/.env.example` to `studio/.env`; provide `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`.
3. `cd studio && npm install && npm run dev` to validate schemas.
4. After checking editor access: `npm run deploy` from `studio/` for a real `*.sanity.studio` URL; invite authorized Marketing users.
5. In Vercel, set `PUBLIC_SANITY_PROJECT_ID` and `PUBLIC_SANITY_DATASET`. Publish real data in Sanity.

## Supabase form storage
1. Create a dedicated VBFA project within the account with adequate capacity. **Do not use another client's database.**
2. Apply `supabase/migrations/001_leads.sql` after authorization.
3. Configure server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY` and public `PUBLIC_TURNSTILE_SITE_KEY` in Vercel.
4. Confirm real opt-in can be stored with consent; don't claim success without database verification.

## Vercel deploy & client handover
- Connect GitHub repository to a new Astro project, target the `feat/astro-sanity-v1` review branch.
- Deploy and capture the real deployment URL. Validate homepage, article route, mobile nav, filters, error-state forms and noindex preview policy.
- Finish Sanity setup and real content, test media assets, and obtain legal/brand approval.
- After UAT acceptance, merge branch to main, promote to production and add the client-owned domain; confirm DNS/SSL, canonical SEO, anti-bot allowed hostname, Sanity Studio configuration and contact-form health.
- Current Vercel connector returns **403 for scope `quangnm`**; redeploy needs reauthorization with team access before an actual URL can be supplied.

## Delivery state
The branch is not production-ready until the checks above pass. The approved official VBFA logo, imagery and exact legal contact information must be provided/confirmed; temporary typographic wordmark and illustrated hero are not official logo assets.

See `docs/ARCHITECTURE_AND_RELEASE.md` and `docs/UAT_CHECKLIST.md` for gates and responsibilities.
