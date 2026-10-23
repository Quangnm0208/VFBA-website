# MASTER EXECUTION PROMPT — VBFA CMS + Backend + Production Readiness
**Date:** 2026-10-22 · **CTO assignment** · **Status:** execute on review branches, do not auto-promote.

## Role
Act as a senior full-stack engineer, Sanity CMS integrator, Supabase PostgreSQL security reviewer, DevOps/QA engineer. Work in GitHub repository `Quangnm0208/VFBA-website`. Use the implementation in PR #6 (`claude/eloquent-meitner-pn6u2b`) **plus the activation branch** `feat/vbfa-services-activation-20261022`. Do not start from an empty site, scaffold a new Next.js app, create a second Sanity project or redesign the frontend. The frontend will be iterated later according to client feedback.

## Grounded infrastructure
- **Sanity**: existing project **`iqyx5ttc`**, dataset **`production`**. Existing repository Studio is `studio/`; host it separately on Sanity.
- **Supabase**: existing dedicated project **`bzrtllytykldnawbuszu`** (display name VBFA), URL **`https://bzrtllytykldnawbuszu.supabase.co`**, region **`ap-northeast-2` (Seoul)**, PostgreSQL 17.11. **DO NOT create another Supabase project or touch other projects.**
- **Vercel**: existing `vfba-website` project under team `quangnm`, function region `sin1`; current AI connector gets scope-403, so authorized operator must set environment variables from Vercel UI. Do not change production settings by guessing.
- Architecture: Astro 7 **static build**, Sanity Content Lake at build time, Sanity-hosted Studio, Vercel Functions for form endpoints, Supabase only for leads/counters, Turnstile.
- Content and frontend are kept on a review branch; **PR #6 is Draft and must not be merged without explicit release authorization**.

## Workstream A — Sanity CMS: complete activation
1. Inspect `studio/sanity.config.ts`, `studio/sanity.cli.ts`, `studio/schemaTypes/`, `src/lib/content/`. Use `SANITY_STUDIO_PROJECT_ID=iqyx5ttc` and dataset `production`. Use existing `studio/.env.example` and `.env.example`; **never put secrets in tracked files**.
2. In the repository root run `npm ci`; in `studio/` run `npm ci`, `npm run typecheck`, `npm run validate`, `npm run build`. Fix errors without unnecessary dependency upgrades; preserve lockfiles.
3. An authorized Sanity member deploys the **existing** Studio with `cd studio && npx sanity@latest deploy` and records the actual assigned URL `https://<allocated>.sanity.studio`. If an authentication token is needed in CI, store `SANITY_AUTH_TOKEN` in repository secrets and never echo it.
4. Verify project plan and actual editor roles in Sanity Manage; invite distinct Marketing members with the minimum practical permissions. Do not assume the Free plan includes granular publishing permissions.
5. Content types: `article`, `page`, `homePage`, `newsPage`, `siteSettings`, `popup`. Singleton documents must not duplicate; test field validation, images, SEO, popup visibility and document references.
6. Run `npm run seed:export`. **Audit content before import**: draft/sample article dates and sample events are not verified. Import only approved seed content using `sanity dataset import seed/seed.ndjson production --missing`. Do not overwrite Marketing changes.
7. Configure Vercel **Preview first**: `PUBLIC_SANITY_PROJECT_ID=iqyx5ttc`, `PUBLIC_SANITY_DATASET=production`, `PUBLIC_SANITY_API_VERSION=2026-10-01`. Build and verify live published content and Sanity image CDN, not fake/mocked client.
8. Set **Preview-only deploy hook** in Sanity webhook. Filter `_type in ["article","page","homePage","newsPage","siteSettings","popup"]`, ignore drafts; test publish, unpublish, document delete, webhook attempts, and verified change in Preview HTML/sitemap/search-index. Never point the test hook to production.
9. Static scheduling limitation: future-dated content requires a rebuild at/after publication time. Implement or document an explicit scheduler if requested; never claim it works without testing.

## Workstream B — Supabase: verify REAL database activation
1. **Already completed on target project** through authenticated Supabase connection, not an emulator:
   - Migration `0001_website_leads` applied (remote version `20261022123647`).
   - Migration `0002_form_throttle` applied (remote version `20261022123654`).
   - Migration `0003_revoke_rls_trigger_access` applied (remote version `20261022123815`).
   - Migration `0004_harden_timestamp_trigger` applied (remote version `20261022124025`).
   - Migration `0005_schedule_metadata_purge` applied (remote version `20261022124107`).
   **DO NOT blindly rerun migrations.** First compare `supabase migration list` to the remote history; local file naming uses numbered legacy filenames so reconcile the version naming before running `supabase db push` or setting up automated DB migration CI.
2. Confirm `public.website_leads` and `public.form_attempts` both have RLS enabled, with no policies granting `anon` or `authenticated` access. This is intentional: the UI must never read lead lists.
3. Confirm anonymous roles cannot run `public.register_attempt` or `public.rls_auto_enable`; service role can insert and invoke throttle. Do not expose `service_role` key in browser or Sanity Studio.
4. Confirm scheduled job `vbfa-purge-lead-metadata` active at **03:17 UTC daily**. It clears `ip_hash` after 30 days and attempts after 2 days. Full lead retention period is **not yet approved** — do not implement arbitrary full-lead deletion.
5. On Preview with a controlled fake identity, test `/api/join/` and `/api/newsletter/` against real Supabase and Turnstile, then remove test records. Test 400/403/405/429/503, invalid Origin, invalid email, no consent, honeypot, rate limit, duplicate newsletter and database outage. Verify no PII appears in server logs.
6. Use Vercel secrets for `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT` (32 random bytes/hex), `TURNSTILE_SECRET_KEY`; public site key and URL only in public settings. DO NOT paste secrets into chat, PR, issues or files.
7. Production must remain `LEADS_ENABLED=false` until privacy page, legal consent, data handling/retention and full end-to-end acceptance are signed off. Preview form testing must be isolated and cleaned.

## Workstream C — Vercel / security / release
1. Keep Astro static output and Vercel Functions as defined by the existing code. Avoid Next.js migration. Confirm no direct client-to-Supabase write path.
2. Configure Preview environment variables, not Production at first. Authenticate team scope `quangnm` via the actual Vercel owner account; do not invent deployment URLs. Do not expose bypass secrets.
3. Validate CSP on `/`, `/tin-tuc/`, all article/static routes, 404; also HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy, JSON API `Cache-Control: no-store`.
4. Set Vercel WAF/rate limit on `/api/*`, check allowed Origin and rate limit behavior with Turnstile. Record abuse testing evidence.
5. Run `npm run verify`, build website/Studio, Playwright responsive, link checker, mobile Lighthouse and accessibility checks. Test actual Chrome/Edge, iOS Safari and Android Chrome if available. CI green alone is not signoff.
6. Report dependencies with runtime/build-time reachability and any unfixed advisories. Do not upgrade major framework versions without test plan.
7. Use approved branding/assets; do not re-upload proprietary font files into the public repo without an authorized redistribution basis. Logo guideline is not itself a license grant.
8. Do not change `PUBLIC_SITE_INDEXING` to `on` or merge PR #6 until release owner provides an explicit GO, selected commit SHA, rollback target and signed content/legal/security QA.

## Required deliverables
A. Actual Sanity Studio URL plus role list and publish/unpublish test evidence.
B. Screenshot/text of live Supabase migration history, RLS/grants, Cron status, security advisors, controlled form test results.
C. Actual Vercel Preview URL and deployment SHA; environmental secret names (never values), verified webhook attempts.
D. UAT results with bug IDs and pass/fail/blockers; accessibility, responsive, performance, security matrix.
E. Updated GitHub PR, branch, final commit SHA, docs and step-by-step reproduction.
F. Release packet: GO/NO-GO, signed gates, rollback plan, production domain/indexing/consent go-live checklist.

**Acceptance rule:** A build against fake Sanity or mocked PostgREST is NOT real-service E2E. Do not claim 'CMS activated', 'forms live' or 'production ready' until authenticated service, deployment and input/output evidence exists.
