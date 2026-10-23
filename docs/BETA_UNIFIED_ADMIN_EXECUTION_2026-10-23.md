# VBFA CTO directive — Beta activation + Unified Admin Portal
Date: 2026-10-23 (Asia/Bangkok). Owner wants one customer-facing **administration URL** for Content + Leads, a verified protected Beta first, then feedback → frontend/content changes → client domain → handover.

## Verified baseline / guardrails
- `main` and Production unchanged; PR #8 (activation) and #6 (to main) are draft. **No merge/promote to Production without explicit Owner GO**.
- CMS (Sanity `iqyx5ttc`, `production`, hosted Studio `https://vbfa-site.sanity.studio`) has real publish/edit/unpublish/delete E2E 21/21 PASS.
- Website Vercel Preview real HTTP/browsers passed majority; target beta branch `feat/vbfa-services-activation-20261022`. Mobile LCP 2.9–3.3s remains QA issue.
- Forms had real 24/24 HTTP E2E on an earlier candidate with 3 rows confirmed and deleted; **rerun with final Beta SHA**.
- Supabase project `bzrtllytykldnawbuszu` real DB migrations 0001–0008 applied. DB Cron ran successfully 2026-10-23 03:17 UTC. CRM Auth and endpoint E2E NOT YET PASS.
- Verified 2026-10-23: `auth.users=0`, `crm_staff=0`, `website_leads=0`. Owner still needs first admin.
- Existing **CRM** is under Website Preview `/admin/`, server-rendered, uses **Supabase Auth** (separate login); **CMS** is a separate `sanity.studio` login. A working CRM + a separate CMS is **not** a unified portal.
- Vercel connector 403 for environment changes; Owner must act once or enable sufficiently scoped agent access. No secrets in chat, repo or logs.

## One-time Owner action bundle (before agents resume real E2E)
1. On **Vercel project vfba-website**, scope exactly `Preview` and branch `feat/vbfa-services-activation-20261022`, add `SUPABASE_PUBLISHABLE_KEY` (public value from `docs/OWNER_SETUP_GUIDE.vi.md` step 7a), `CRM_ENABLED=true`, verify existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), `IP_HASH_SALT` (Sensitive; guide previously reported missing), `PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are present and branch-scoped. Redeploy **Preview**, not Production. Keep Preview protected.
2. Supabase project `bzrtllytykldnawbuszu` → Authentication → Email provider: disable **Allow new users to sign up**; save. Critical before first CRM login because CRM grants bind by email.
3. Create an **Owner admin** in Supabase Authentication → Users → Add user, manually confirm email; run **only the bootstrap role INSERT in** `docs/OWNER_SETUP_GUIDE.vi.md` step 7c with the owner's email entered *inside Supabase SQL Editor*, not chat. Use strong temporary password and change it inside CRM. Do not send identity, credentials or keys to agents.
4. Vercel Firewall: configure and verify a practical rate-limit for `/api/*` **and** `/admin/*` (latest `docs/SECURITY_REPORT.md` proposal: 120 req/min/IP, block 1 min; check Vercel plan/rule UI). If not possible, record explicit remaining Beta risk and equivalent mitigations.
5. Confirm protected invitation-only Beta, synthetic records only, permission to create a **single VBFA Admin Vercel project** using the available plan capacity, and delegate CMS/CRM permission configuration. Name approvers for content and for privacy/consent/retention before live leads. Client's public domain is for **after feedback**, not now.

Note: GitHub `VERCEL_PROTECTION_BYPASS` and Studio webhook were previously configured, do not recreate without checking.

## Team execution — do not pause for routine engineering decisions

### Gate 1 — Unblock and prove existing CRM end to end
1. Verify Vercel Preview environment and exact deployed SHA without exposing secret values.
2. Check that `/admin/login/` is no longer 404 only on protected Preview. Check 401/403/200 behavior with real Supabase Auth.
3. Run `VBFA Preview real-service E2E` (real forms + CRM). Create synthetic test accounts only under explicit Beta authorization, never use Owner password.
4. Verify: invitation-only signup disabled, login/logout session revocation, RBAC admin/staff/outsider, IDOR, pagination/filter, update status, add note, audit, real form→lead→CRM visibility, logs no PII/secrets. Confirm SQL readback and remove synthetic leads/notes/test accounts. Keep genuine Owner admin account.
5. Record URL, run ID, exact SHA, deployment ID, SQL counts before/after, browser screenshots under `docs/evidence/`. If tests fail, fix on beta branch, CI green, redeploy, re-run. Do not claim real E2E PASS from PGlite/mocked Auth.

### Gate 2 — Deliver ONE Admin Portal for Content + Leads
Target one customer-facing Vercel Admin URL, e.g. `https://<verified-vbfa-admin-preview-host>/`, later `https://admin.<client-domain>/` (these are patterns, not existing URLs).
- **Preferred implementation:** reuse existing `studio/` **self-hosted Sanity Studio** as the administrator's React shell on a separate Vercel project `vbfa-admin` (within already-paid/free slots if capacity allows). Add a **custom Studio tool** for CRM Leads, reuse the proven Supabase CRM server-side business logic rather than clone DB or invent another CRM.
- Reuse `iqyx5ttc/production` and `bzrtllytykldnawbuszu`. No new Sanity or Supabase project. Reuse security-validated RPC, sessions/permissions where compatible.
- Do not confuse a single URL or menu link with **single sign-on**. The current CRM uses Supabase Auth while Studio uses Sanity identity. A secure one-login experience requires a server-verified identity bridge and authorization mapping (or supported SSO). **Do not pretend sharing browser cookies, embedding an iframe or hiding nav makes it SSO.** Architect/verify a secure bridge with strict allowlisted roles and independent server authorization for every lead operation. If impossible without new paid auth/unsupported tokens, deliver a protected one-URL Portal with transparently separate CRM and CMS sign-in **only if Owner expressly accepts that Beta deviation**. Never weaken Auth or publicly expose lead data for convenience.
- For a self-hosted Sanity Studio, configure fixed permitted Sanity CORS Origin(s) with credentials; no wildcard `*.vercel.app` with credentials; SPA fallbacks, real Studio login, exact project/dataset, no Studio token hardcoded.
- If this requires a separate Vercel Admin project with GitHub root directory `studio/`, verify Functions/API routing and custom tool packaging/deployment are actually feasible. If not, establish an equivalent safe separate admin app in the same repo; don't silently relabel `/admin/` plus external Sanity tab as unified.
- Admin must provide branded entry/dashboard and distinct `Nội dung`, `Lead`, `Nhân sự` sections. CRM views: filters/pagination, notes/status, roles/audit. Secure navigation, logout, responsive 375/768/1440, role checks on actual API. Leave the hosted Studio URL as operational fallback, but hand customer the unified Admin URL.

### Gate 3 — Secure protected Beta and accept
- WAF or approved compensating controls, Supabase Auth registration closed, Preview protected, `noindex`, test Turnstile keys only protected Preview, service role server-only, lead data anonymous access denied, correct CORS/CSP and cache headers.
- Smoke website/mobile/LCP investigation; recognize CLS <0.1 and Vercel Preview `vercel.live` CSP artifact without relaxing security. Measure and document before/after LCP using same CI runner; fix obvious image critical-path or font issues if feasible.
- CMS publish/unpublish should update Website Beta via approved webhook. Avoid testing removal of the last published article without seeding approved other published content.
- Owner Beta acceptance packet requires: **two URLs** (Website Beta + unified Admin Beta), account invitation/use instructions, CI/deployment SHA, real browser + DB E2E, security evidence, known issues, rollback. Distinguish CRM actual vs mocked PASS.
- No publish to public Production or custom client domain until later Owner GO. Use synthetic data until privacy/consent/data retention approved.

### Gate 4 — Feedback then final production / handover
1. Collect client feedback, fix only requested frontend/content and any beta bugs, regression test website+CMS+CRM+backend.
2. Obtain written privacy/consent/retention/content/brand approval, production Turnstile keys, WAF, official contacts and domain authorization.
3. After explicit Owner production GO only: merge approved PR #8 → #6 release chain to `main`, production Vercel env, SSL/DNS, site/admin domains, callbacks, Sanity webhooks, canonical/sitemap, optional indexing. Re-run real production smoke.
4. Deliver complete documents: architecture and repo/release SHA, Vercel project/rollback, **unified Admin login URL**, roles/invite/revoke, Sanity content editing/SEO/popups, CRM lead/status/note operations, form flow, Supabase migrations/retention/backup, env names (not values), webhook and incident runbooks, official website URL, acceptance checklist. If two login methods remain, document honestly.

## Status/protocol
For every gate report **DONE / REAL EVIDENCE (URL, run ID, SHA, DB counts) / BLOCKED / OWNER ONLY / NEXT**. Do independent work while a permission is blocked. Production `main` stays untouched before GO.
Stop condition: `BETA VERIFIED — WAITING FOR CLIENT FEEDBACK` **only** after protected Website Beta + real CRM Auth/RBAC and lead E2E + one-portal acceptance + security controls are evidenced.
