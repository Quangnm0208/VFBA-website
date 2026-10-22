# VBFA — service activation log (2026-10-22)

## Fixed environment targets

| System | Verified configuration | Current status |
|---|---|---|
| GitHub | `Quangnm0208/VFBA-website` | Draft PR #6 remains unmerged |
| Sanity Content Lake | Project `iqyx5ttc`, dataset `production` (from client Sanity setup screenshot) | Project ID provided; Studio hosting and data publication NOT verified |
| Supabase | Project `bzrtllytykldnawbuszu` (name `VBFA`) | **ACTIVE_HEALTHY**, Postgres 17.11, region **ap-northeast-2 (Seoul)** |
| Vercel | `vfba-website`, existing project in `quangnm` scope | API connection returns 403; no environment change made |

The connected Vercel runtime is in `sin1` while the EXISTING Supabase project is in `ap-northeast-2`. This introduces cross-region writes; measure form latency before launch. **Do not recreate the database or move it without client approval.**

## What was actually executed on the dedicated Supabase project

Migrations were committed to GitHub under `supabase/migrations/` and applied through the authenticated Supabase project connector:

| Order | Migration | Remote version | Result |
|---|---|---|---|
| 1 | `0001_website_leads.sql` | `20261022123647` | APPLIED |
| 2 | `0002_form_throttle.sql` | `20261022123654` | APPLIED |
| 3 | `0003_revoke_rls_trigger_access.sql` | `20261022123815` | APPLIED |
| 4 | `0004_harden_timestamp_trigger.sql` | `20261022124025` | APPLIED |
| 5 | `0005_schedule_metadata_purge.sql` | `20261022124107` | APPLIED |

Verified on the real project: `website_leads` and `form_attempts` exist and RLS is enabled; `anon` cannot SELECT `website_leads` or EXECUTE `register_attempt`. `service_role` has INSERT and `register_attempt` execute rights. Existing elevated `public.rls_auto_enable()` had callable rights granted to `anon`/`authenticated`; those rights were revoked. `touch_updated_at()` now has pinned `search_path` and no direct public invocation.

**Security advisor after remediation:** no remaining WARN/ERROR results for these functions. Two informational `rls_enabled_no_policy` findings are expected and **intentional**: browser roles must have no access to private lead tables.

**Metadata job:** `vbfa-purge-lead-metadata` is **active**, scheduled `17 3 * * *` (03:17 UTC daily). It clears hashed client fingerprints on leads after 30 days, and attempts older than 2 days. It DOES NOT delete full lead rows. A client-approved lead retention policy is required separately before go-live.

## Sanity activation to be completed with owner access

The project ID in the Sanity onboarding screenshot is `iqyx5ttc`. Use the existing `studio/` app; do not create a second project, a Next.js app, or a duplicate Studio.

1. On an authorized engineering workstation, clone the PR #6-derived implementation branch and run `npm ci` from the repository root.
2. `cp studio/.env.example studio/.env`; verify `SANITY_STUDIO_PROJECT_ID=iqyx5ttc`, `SANITY_STUDIO_DATASET=production`.
3. `npm ci --prefix studio`, `npm run studio:install` only if no lock exists, `npm --prefix studio run validate`, and `npm --prefix studio run build`.
4. With a member authorized to deploy, `cd studio && npx sanity@latest deploy`. Use a genuinely assigned `*.sanity.studio` hostname; do not invent one.
5. Invite Marketing user(s) individually; confirm plan and role permissions in Sanity Manage. Never share login tokens.
6. Export seed with `npm run seed:export`. **Review/sample article and image rights first**; then import approved seed with `sanity dataset import seed/seed.ndjson production --missing`.
7. Connect **Preview** to `PUBLIC_SANITY_PROJECT_ID=iqyx5ttc`, `PUBLIC_SANITY_DATASET=production`; deploy and verify actual published fetch, publish/unpublish, invalid document build rejection, media CDN, and preview-only rebuild webhook.
8. Only after acceptance, repeat approved configuration for Production.

## Vercel environments: required checklist

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `PUBLIC_SANITY_PROJECT_ID` | `iqyx5ttc` | same after UAT | Public identifier |
| `PUBLIC_SANITY_DATASET` | `production` | same | Published content |
| `SUPABASE_URL` | `https://bzrtllytykldnawbuszu.supabase.co` | same | No secret in URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Prefer absent | Secret after E2E | NEVER in Git/Chat/frontend |
| `IP_HASH_SALT` | Controlled testing only | Secret, random 32 bytes | REQUIRED before accepting forms |
| `PUBLIC_TURNSTILE_SITE_KEY` | Test widget | Published widget | Domain-specific |
| `TURNSTILE_SECRET_KEY` | Secret | Secret | NEVER in Git/Chat |
| `LEADS_ENABLED` | false by default | **false until legal signoff and E2E** | Fail closed |
| `PUBLIC_SITE_INDEXING` | off | off until public launch | Avoid accidental indexing |

**Vercel connector reported 403 under team scope `quangnm`.** Environment variables were NOT added. Authorize access or have owner set them in Vercel → Project Settings → Environment Variables; do not share secrets in a chat.

## Real service acceptance (not yet executed)

- Marketing can login, edit, publish/unpublish content and see Preview rebuild from Sanity webhook.
- Sanity draft remains invisible; invalid content causes failed candidate build without changing live.
- Verify two forms over HTTPS, Turnstile token, rate limits and actual inserted record under approved consent.
- Verify no anonymous access to lead data via Data API or RPC.
- Verify privacy wording, retention and deletion requests in writing.
- Set Vercel WAF `/api/*` limit and test; confirm production rollback target and actual deployment ID.
- Merging PR #6 targets `main` and automatically deploys production: **DO NOT MERGE** without owner-authorized release gate.

## Links
- [Supabase VBFA project](https://supabase.com/dashboard/project/bzrtllytykldnawbuszu)
- [Sanity project dashboard](https://www.sanity.io/manage/project/iqyx5ttc)
- [PR #6 release candidate](https://github.com/Quangnm0208/VFBA-website/pull/6)
- [Release checklist](CTO_RELEASE_GATES.md)
