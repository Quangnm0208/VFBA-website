# CTO RELEASE CONTROL — VBFA (22 October 2026)

**Decision: UAT READY / PRODUCTION NO-GO.** This document is a gate checklist, not evidence of live integration. Do not merge PR #6 or change the production alias merely because CI is green.

## Architecture frozen for V1
- Astro 7 SSG on Vercel CDN; serverless functions only for `/api/join/` and `/api/newsletter/`.
- Sanity Studio hosted by Sanity; six document types (article, page, homePage, newsPage, siteSettings, popup); Content Lake build-time fetch.
- A **dedicated VBFA** Supabase PostgreSQL project for leads and attempt counters, no client database access.
- Cloudflare Turnstile on both forms; no personal data intake until legal approval and `LEADS_ENABLED=true`.
- Marketing feedback may adjust frontend on review branches; separate frontend visual changes from schema/data migrations.

## Evidence classified correctly
| Gate | Current | Requirement to close |
|---|---|---|
| Website/Studio CI | PASS (reported run #45 / PR #6) | Re-run on release candidate SHA |
| Static/browser testing | Lab PASS; real device not done | Test Chrome/Edge, iOS Safari, Android Chrome, keyboard, screen reader |
| Security headers | GET endpoints checked on two previews | Verify HEAD/GET/404/API on final head deployment and public alias |
| Sanity integration | MOCK only | Project + dataset owned by VBFA, Studio login, role verification, publish/unpublish/webhook/invalid-content tests |
| Supabase | PGlite/mocked PostgREST only | Dedicated project; apply migrations; verify no public table/RPC privileges and perform form E2E |
| Privacy and consent | NOT APPROVED | Written client sign-off and published Privacy Policy |
| Lead retention | UNDEFINED | Record an approved lead retention period and DSAR process |
| Turnstile | NOT CONFIGURED | Register Preview and custom-domain hostnames; verify real tokens |
| Firewall rate limits | NOT CONFIGURED | Configure Vercel WAF/rate-limits on /api/*; test 429 |
| Media/content rights | UNVERIFIED | Replace sample articles 4–10, confirm image provenance and contacts |
| Proprietary font exposure | P0 OPEN | Written web/redistribution permission **or** owner-authorized rollback and public Git history sanitation |
| Dependency advisories | RECORDED | Re-run npm audit on exact lockfiles, classify runtime/build-only reachability and mitigation |
| Production promotion | HOLD | Signed GO approval, exact SHA, rollback, live smoke, indexing decision |

## First operations to perform (owner-controlled)

1. **Font exposure / immediate governance:** Determine whether valid redistribution/web licences exist for SVN-Bebas Neue Pro and SVN-Primark. If absent, request explicit owner approval to roll production back to `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX` (known `main@9e6be54`) and plan a coordinated purge of public Git history and any deployment serving restricted font assets. A simple deletion commit does not purge Git history. Do not force-push or roll back without approval.
2. **Sanity:** Owner creates project `VBFA` / `production` dataset; check actual plan/editor roles; deploy Studio; seed only authorized content; verify login and create/edit/publish/unpublish and webhook rebuild on **Preview** hook first. Keep production Deploy Hook URL secret.
3. **Supabase:** Owner approves creation/billing for a dedicated VBFA project (suggest `ap-southeast-1`), runs migrations `0001_website_leads.sql` and `0002_form_throttle.sql` in order; verify RLS/grants with `anon` and `authenticated`; enable pg_cron and confirm daily purge. Run E2E on a separately scoped test project (or isolated test data) using a controlled test identity.
4. **Turnstile and privacy:** Obtain approved privacy/consent versions and contact point; configure site/secret keys for **both forms**; only then enable lead intake.
5. **Marketing:** Verify samples, real dates, approved logos/images, address/contact details and brand font decision before site indexing.
6. **Vercel:** Configure Preview first; avoid sharing `SUPABASE_SERVICE_ROLE_KEY` or `IP_HASH_SALT` in any chat/document. Test API endpoints with protected Preview authorization via secure settings. Add WAF limits; confirm rollback deployment. After approval and E2E, merge exact SHA, verify production deployment fingerprint and preserve logs/screenshot evidence.

## Security acceptance protocol
- Non-POST methods → 405; unexpected Origin → 403; oversized/malformed JSON → 4xx; missing credentials or `LEADS_ENABLED` not true → 503 and zero database writes.
- Validate honeypot, consent, email, rate limit, Turnstile on all exposed POST routes. No personal data (email, name, raw IP, service role key, Turnstile secret) in application logs.
- `anon` and `authenticated` must not read/write `website_leads` / `form_attempts`, nor execute `register_attempt`. Verify on **real Supabase**, not just migration review.
- Newsletter repeat submission must be idempotent; privacy data deletion must be verifiable and tested. Confirm the scheduled retention job actually runs.
- Verify CSP on 200/404, HSTS/Referrer-Policy/nosniff/XFO, indexing off during UAT, no secret leakage in bundle, repository, sourcemaps or deployments.
- Confirm SSG schedule limitation: future-dated articles require a later build. Do not promise scheduled publishing until an explicit scheduler is implemented/tested.

## Promotion record (fill in when real gates close)
| Field | Value |
|---|---|
| Release owner | PENDING |
| Approved PR/head SHA | PENDING |
| Sanity project ID/dataset/Studio URL | PENDING |
| Supabase project ref + migration checksums | PENDING |
| UAT evidence and legal sign-offs | PENDING |
| Vercel preview deployment ID | PENDING head validation |
| Production deployment ID and URL | HOLD |
| Pre-promote rollback deployment | `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX` (re-verify before use) |
| Release decision | NO-GO |

Cross-references: `docs/OPERATIONS.md`, `docs/RELEASE.md`, `docs/QA.md`. **This checklist does not turn failed or unrun E2E checks into PASS.**
