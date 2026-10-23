# VBFA — BETA FIRST / OWNER ONE-TIME HANDOFF / AGENT EXECUTION
Date: 2026-10-23 (Asia/Bangkok)
Status: **Beta NOT accepted until end-to-end evidence exists**. Production remains HOLD.

## Owner provides once (single consolidated handoff)

1. **Access and secure configuration**: grant engineering agent role-scoped access to Vercel team `quangnm` and project `vfba-website` (connector currently 403) or configure the requested Preview branch-scoped variables personally. For secrets, use Vercel/GitHub Secrets only; never paste values into chat/issues. Existing Sanity project `iqyx5ttc` is live at `https://vbfa-site.sanity.studio`; ensure agent can manage its API webhooks, and editor users are individually invited. Grant Cloudflare Turnstile setup and Vercel WAF permissions or create those controls via the dashboards.
2. **Beta URL and audience**: approve using a Vercel **Preview deployment with access protection** as beta, no custom domain, `noindex`. Supply the email addresses (through a secure admin channel) of the owner/Marketing/CRM beta testers and the client reviewers. Choose which of them may see lead data. No general-public access to test-key forms.
3. **Data-processing scope**: approve synthetic/test leads only until Privacy Policy, checkbox wording, retention, deletion, contact details and disclosures are reviewed. If invited users will enter real personal data during beta, approve the live privacy and consent texts **before** accepting it. Set an explicit lead retention period and owner of deletion requests; do not assume the metadata purge is full-data retention.
4. **Content/brand**: designate owner/Marketing approver, authorize use of brand imagery/typefaces or provide replacement assets; allow test article `Test-123` only in **protected beta**, clearly marked as test. Supply confirmed official email/phone/address before a public launch. Frontend refinements wait for client feedback.
5. **Commercial access**: confirm existing Vercel/Sanity/Supabase project quota is adequate and authorize **no new paid products/projects without separate approval**.
6. **Two release decisions**: (a) explicit GO for limited-access beta with synthetic data; (b) later independent GO for public production, indexing, real lead intake and adding the client domain. No implied authorization to merge into `main`.

## Current existing project facts (must re-verify live)
- GitHub repo `Quangnm0208/VFBA-website`; release chain: PR #8 (activation -> `claude/eloquent-meitner-pn6u2b`) then PR #6 (-> `main`). Both currently DRAFT, not merged to public production. PR #10 merged into activation.
- Sanity project `iqyx5ttc`, published dataset `production`, Studio `https://vbfa-site.sanity.studio/` deployed; the test article `Test-123` must not be treated as real content.
- Existing Supabase `bzrtllytykldnawbuszu` Postgres 17, region `ap-northeast-2`; 6 migrations implemented per latest handover; RLS denies public role access to leads.
- Metadata Cron `vbfa-purge-lead-metadata`: first **successful** run verified 2026-10-23 03:17 UTC. Lead count was 0 at that verification. This is not full lead deletion.
- Existing Vercel Preview renders actual Sanity content according to release packet; Vercel connector still returns 403 to `quangnm`.
- **Important gap**: `website_leads` is a data table; a functioning CRM user interface with authentication and operational workflow is not yet established in the repository. Beta scope must include a minimal, secure CRM Lead Inbox.

## Agent mission (complete work autonomously within delegated rights)
### 0 — Baseline and branch protection
- Re-check exact PR heads, CI, Sanity published content, Supabase migrations and Vercel Preview deployment. Do not rely on old SHAs. Reconcile PR #8 with updated releases; no `main` or Production changes before owner GO.
- Make a dedicated beta integration branch from latest activation and an issue checklist with owners/evidence. Preserve frontend layout and branding; no redesign for beta.
- Confirm acceptable preview protection, noindex, URL, review invitation list and developer role. Fail closed on missing secrets.

### 1 — Sanity CMS and content update loop
- Verify existing standalone Studio `studio/`, schemas for article/page/homePage/newsPage/siteSettings/popup, source projections and published-only fetches, 1–3 featured articles support.
- Create Preview-only Vercel Deploy Hook and Sanity published create/update/delete webhook, with proper access rights. Store hook URL as secret, never in source/log. Test publish/edit/unpublish; avoid breaking build when no real article remains; preserve stable live Preview when candidate fails.
- Preview content may include `Test-123` **marked as test**. Deliver owner-facing instructions for replacing it with approved content.

### 2 — Backend forms: real service E2E
- Verify remote Supabase migration history and current RLS/grants/Cron first; do not re-run applied migrations or change unrelated projects. Existing ID `bzrtllytykldnawbuszu`.
- Configure branch-scoped Preview server secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY`; browser sitekey `PUBLIC_TURNSTILE_SITE_KEY`; controlled `LEADS_ENABLED=true` only for protected Preview QA. Production unchanged.
- Protect Preview before testing always-pass Turnstile keys. Run HTTP E2E and **SQL confirmation** of exactly expected test rows; inspect for PII/secret leakage; delete synthetic rows and verify 0 test rows. Restore beta form behavior only in line with privacy approval.
- Re-test newsletter dedupe, consent version, throttling, too-fast rejection, invalid origin/token and backend failures.

### 3 — BUILD **minimal CRM beta**: not equivalent to Supabase Table Editor
- Reuse **existing Supabase** and existing private lead tables; do not create new Supabase/Vercel projects.
- A protected `/admin/leads/` (or equivalent separated admin entry) with actual login via **Supabase Auth**; approved invited users only, no public signups. The frontend must never receive service_role.
- Server-side authz for every read/mutation. Use Supabase Auth verified identities and a strict, admin-maintained role/allowlist (not user-editable metadata); owner/admin role and staff/Marketing role. Use Vercel Functions or securely configured RLS. Keep any privileged DB API server-only.
- Lead Inbox MVP: list and search sanitized leads, filter by `newsletter`/`membership`, view detail, change status New/In progress/Closed, internal note with timestamp and actor, basic pagination; show consent source/time and intake status. Scope exports behind explicit access and leave off by default. No CRM email campaigns, workflow automation or third-party CRM integrations in beta.
- If status/notes tables are needed, use timestamped additive migrations with RLS and explicit grants; get owner consent for database privilege changes, never destructive migration without approval. Audit actor/action with no secrets and minimal PII.
- Sessions with proper expiry/cookies or token verification; prevent IDOR, unauthorized direct API access, CSRF as applicable; confirm no personal data in HTML caches/logs. Check 401/403, role restrictions, pagination and concurrent updates.
- Admin URL separate from public site navigation, `noindex`, access protected. Document how Owner invites/revokes users and resets access.

### 4 — Security / QA / beta sign-off
- Test 320–1920px website, CSS/motion, mobile menu, forms, published CMS, CRM desktop/tablet usability, accessibility keyboard and errors.
- Confirm security headers on all paths, no secrets in bundles, WAF `/api/*` including admin endpoints, request limits, protected beta, Supabase advisor and dependencies.
- Run CI + Playwright + Lighthouse and **live** Preview browser/e2e, distinguish real from mocked. Client UAT uses invite-only site, and synthetic data until legal/retention signoff.
- Deliver **Beta Evidence Packet**: actual website Preview URL, Studio URL, CRM login URL, exact commit SHA, deployment ID, test results with screenshots, status of migrations/Cron, list of beta identities/roles (no passwords), known bugs, rollback deployment, unresolved owner gates.
- Keep `main`, production variables, public indexing, client domain unchanged. Do not declare Beta PASS before website→Function→Supabase→CRM read & update→Sanity publish round-trip is verified.

### 5 — After client feedback / final cutover
- Apply scoped frontend/content changes from client feedback via new PR, without losing CMS/CRM.
- Replace all test content, approve official imagery/contact/privacy; setup real Turnstile, WAF, retention/deletion and live consent.
- After **explicit final owner GO**, promote the approved SHA to `main`, configure client domain in Vercel, DNS/SSL, canonical/sitemap/robots, Sanity production webhook and Turnstile allowed hostnames. Run live production smoke, record rollback.
- Deliver **handover documentation**: architecture/deployment diagram, GitHub repo/branch/commit, Vercel project and deployed domain, Studio login URL and Marketing instructions (create/edit/publish media, SEO, popup), CRM login URL and staff/admin SOP, form mapping and consent/retention, env names (never values), Supabase schema/migration/backup, webhook and restart procedures, user invitation/revocation, WAF/security and incident/rollback/runbook.

## Blocker protocol
- Work through independent tasks. When a permission is missing, record **ONE** `OWNER_ACTION_REQUIRED` bundle: required service, scope and exact UI path; do not repeatedly ask for the same credential.
- Never store real secrets in PR comments or chat. Never assert deployment/E2E success without durable evidence.
- Report in this order: DONE / EVIDENCE / OWNER ONLY / BLOCKED / NEXT. Avoid generic progress updates or ungrounded completion statements.
- **Two approvals**: beta UAT with synthetic data and final go-live with real data are distinct. If owner withholds final approval, stop at `BETA VERIFIED / WAITING FOR CLIENT FEEDBACK`.
