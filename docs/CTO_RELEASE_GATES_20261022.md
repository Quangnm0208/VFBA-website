# VBFA CTO — Backend/CMS hardening and production release gates
Date: 2026-10-22
Status: **UAT candidate, NO-GO for production**. This document is a release checklist, not proof of live-service verification.

## Architecture frozen for client review
- Frontend: Astro static prerender, Vercel CDN. Keep the design unchanged until customer feedback.
- CMS: Sanity Studio separately hosted on Sanity; published content is fetched at build time from Content Lake.
- Assets: Sanity CDN for approved images/media.
- Forms: Vercel Functions + Cloudflare Turnstile + dedicated VBFA Supabase PostgreSQL.
- No additional Next.js, WordPress, Redis, or generalized application server required for this scope.

## Code-level security completed in this hardening branch
1. Newsletter requires a visible, mandatory email-marketing consent checkbox. The API validates `consent:true` and a consent version of the form `newsletter-v<n>` (text and version are managed together in the Studio and rendered in the same build); a forged unchecked request fails before a DB attempt.
2. Frontend stops inferring consent merely from using the newsletter form; newsletter consent is now an explicit action.
3. A form backend is enabled only when `LEADS_ENABLED=true`, an HTTPS Supabase URL, server-only service-role key, HMAC salt, public Turnstile sitekey, and private Turnstile secret are all present. Otherwise 503, never silently persist.
4. Compiled-Function QA intercepts Turnstile only in the test runner with Cloudflare's documented dummy credentials; production uses Cloudflare Siteverify directly.
5. Supabase migration explicitly grants INSERT to `service_role` so a newly created database does not depend on historical project default permissions. RLS remains enabled; anon/authenticated remain revoked.
6. CI covers both Astro frontend and Sanity Studio; browser E2E includes newsletter consent.

## Mandatory owner steps before the next milestone

### P0 — copyright and deployed fonts
- The previous CTO report records SVN-Bebas Neue Pro and SVN-Primark without verified web redistribution rights in *public Git history* and one earlier *production deployment*. Simply deleting files in a later commit cannot remove historical exposure.
- The owner must either provide written web/redistribution authorization **or explicitly authorize both** (a) rollback from the exposed deployment to the verified clean build and (b) history remediation of the unmerged candidate branch.
- No history rewrite, rollback, deployment promotion or production merge is authorized by this document.

### P0 — Sanity tenant and editorial control
- Create a VBFA-owned Sanity project; dataset `production`; record Project ID and actual plan/roles. Do not presume Editor role on Free.
- Deploy Studio from `studio/` using the real project ID. Confirm login by Marketing; invite individual accounts, not shared credentials.
- Import **only approved** seed material; sample articles and invented publication dates must not be published to the public domain. Check publish/unpublish, invalid data handling, image rights and the exact webhook filter.
- Store the Vercel Deploy Hook URL as a secret in Sanity (never in this repository), trigger **Preview** first.
- Scheduled publication remains a known limitation of static builds: use a controlled scheduled rebuild or do not promise exact publication time.

### Legal source check (official texts effective 2026)
- Vietnam's Law on Personal Data Protection No. 91/2025/QH15 is effective **01/01/2026**: https://vanban.chinhphu.vn/?classid=1&docid=214590&pageid=27160&typegroup=
- Implementing Decree 356/2025/ND-CP is effective **01/01/2026**: https://vanban.chinhphu.vn/?classid=1&docid=216387&pageid=27160
- The earlier Decree 13/2023/ND-CP should not be used as the sole basis for new consent/legal wording. Legal review must cover both newsletter and membership, rights of data subjects and data retention/deletion, and any applicable cross-border processing obligations.
- This is a CTO check of relevant sources, **not a substitute for written legal approval**.

### P0 — Supabase tenant and privacy
- Create an isolated VBFA Supabase project **only after owner approval for billing/project limits**. Do not reuse the three unrelated projects in the connected account.
- Apply `0001_website_leads.sql`, then `0002_form_throttle.sql`. Inspect RLS, API grants, RPC EXECUTE rights, explicit service-role INSERT, indexes and pg_cron retention task in the real database.
- Confirm and publish a client-approved privacy notice, newsletter consent statement, membership consent statement, processing purpose, retention/deletion policy and contact for data-subject requests.
- Keep `LEADS_ENABLED` OFF until legal approval, both Turnstile keys, dedicated Supabase credentials, firewall abuse controls and real end-to-end evidence are complete.
- Form-test data must use controlled identities and be deleted with an audit record after verification.
- Do **not** paste credentials, webhook URLs or bypass secrets into chat or Git commits.

### P1 — hardening and UAT
- Configure Vercel project/team access correctly and validate a real authenticated Preview URL. Do not infer production readiness from GitHub Actions.
- Add Vercel Firewall request throttling for `/api/*`; application throttling alone does not cover all rejected traffic.
- Re-run dependency security audits with locked dependencies; review any outstanding build-time advisories and distinguish deployed runtime packages.
- Confirm CSP/HSTS/nosniff/404 and POST behavior on real Vercel deployments, including protected preview access.
- Test at least Chrome + Safari mobile; keyboard, focus, screen reader and reduced-motion. Validate real-image alt text and typography.
- Verify public domain anonymously when approved; canonical and robots/indexing must remain disabled until final sign-off.

## Definition of Done
1. Sanity project ID, real Studio URL, editor roles and publish→Vercel Preview refresh recorded.
2. Dedicated Supabase project, migration checks, anon denial, Turnstile verification and actual rows/consent version verified.
3. Approved privacy text, retention/deletion policy, client contact information, image provenance and content ledger signed off.
4. Public font issue either licensed in writing or remediated, including deployment and branch history.
5. Release-candidate SHA pinned; CI and real Preview HTTP/browser/API smoke recorded and PASS.
6. Explicit owner GO for merge/promotion and a tested rollback path.
7. Client domain attached only after GO; indexing turned on only after SEO/content/legal approval.

**Current decision:** keep PR #6 and this security PR unmerged until the gates above close.
