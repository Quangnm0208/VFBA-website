# Release record, gates and sign-off registers

Status of the Astro release candidate (branch `claude/eloquent-meitner-pn6u2b`). Facts here were read from GitHub and
Vercel on **2026-10-22**; anything marked *not verified* could not be checked from the build environment. No secret,
Deploy Hook URL or protection-bypass value is recorded in this repository.

## 1. What is deployed today (observed, not assumed)

| Item | Value |
|---|---|
| Vercel project | `vfba-website` (`prj_PhsAfcm2hPPNjN1wmhQ02m1reCGd`), region `sin1`, Node 24.x |
| Production alias | `vfba-website-alpha.vercel.app` |
| Production deployment now | `dpl_9jxuNcjYNQcn9kdTXCZfqX5WcXnG`, built from **branch** commit `f9ef1c0` (the earlier *static HTML* build), `target: production` |
| Rollback target (previous production) | `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX`, `main@9e6be54` (static HTML, no SVN fonts) |
| Older production deployments | `dpl_5gyNhi8XTmCLgV8tmqzmbad9GVv3` (`main@fdcf50e`), `dpl_Z9a3XqqW1s4zKC2EoJmQP9Fh9T5t` (`main@ae0ce4e`), `dpl_EGdAGqKZvbSrGRKRUgEug7v1AJkh` (`main@1bea9bb`) |
| Deployment protection | `ssoProtection: all_except_custom_domains` (Vercel Authentication on previews). Whether the production alias answers anonymous visitors was *not verified* from the build environment: check in a logged-out browser |
| Search engines | blocked: `PUBLIC_SITE_INDEXING` unset (= off), `noindex` meta and `X-Robots-Tag` on every page |
| Environment variables for Sanity, Supabase, Turnstile | none set (the site runs on seed content and the forms answer `503` by design) |

**This candidate has not been deployed to production.** Its previews are separate deployments (`target: null`) and do not
touch the production alias. Latest previews at the time of writing:

| Commit | Deployment | State |
|---|---|---|
| `348efbd` | `dpl_6LS3pcUKGaWHCuxdLMRi9yUWXoD7` | READY |
| `f35225f` | `dpl_3PfGKVNcYkurHU9N2xjFtg6sLmsh` | READY, build marker `f35225f` verified on `/`, `/tin-tuc/`, unknown path (404) |

## 2. What merging does (read before touching `main`)

The Vercel project deploys every push to `main` to **production** automatically (all previous `main` commits show
`target: production`). Merging the pull request therefore publishes this candidate on the production alias within
minutes. Nothing in the repository prevents that, so the merge itself is the release decision.

- The merge needs the owner's explicit authorisation; the engineering work does not merge and does not promote.
- Rollback is Vercel -> Deployments -> `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX` -> *Instant Rollback* (or *Promote to Production*),
  or `request_rollback` through the Vercel tooling. It needs no rebuild and no Git change.
- After the merge, `live-smoke.yml` runs `scripts/qa/smoke.mjs` against the production alias and waits for the exact commit
  (`<meta name="vbfa-build">`). If the alias turns out to be behind Vercel Authentication, add the repository secret
  `VERCEL_PROTECTION_BYPASS` first, otherwise that job reports a login page, not the site.

## 3. Go / no-go gates

| Gate | State | Evidence / owner action |
|---|---|---|
| Branch reconciled with `main` (`9e6be54`), no conflicts | **done** | merge commit `e8aa58a`, clean fresh-clone `npm ci && npm run verify` |
| CI green on the candidate | **done** for `f35225f` (run #42: Website + Studio jobs); re-check the head commit on the PR | |
| Security headers incl. CSP on every page and the 404, on a real Vercel deployment | **done** (GET): `/`, `/tin-tuc/`, 404 on `f35225f`; `/api/join/`, `/api/newsletter/` answer `405` with `Allow: POST` on `d74a836` | POST-level smoke on a protected preview needs the *Protection Bypass for Automation* secret (owner) |
| Compiled-function behaviour (methods, bodies, limits, fail-closed) | **done** in CI with an emulated database (not a real one) | `scripts/qa/api-function.mjs`, 49 checks |
| Core Web Vitals (lab) | **done**: LCP 2.18-2.43 s, CLS <= 0.0003 on three key pages in the agreed profile | `docs/QA.md`; field data after launch |
| Sanity connected, publish/unpublish/webhook verified | **blocked**: needs the owner's Sanity project | `docs/OPERATIONS.md` section E |
| Supabase connected, real end-to-end verified | **blocked**: no dedicated VBFA project exists | `docs/OPERATIONS.md` section B + checklist |
| Privacy policy, consent wording approved by the client | **blocked** (legal) | section 6 |
| Content, images and contact details signed off | **blocked** (Marketing) | section 5 |
| Production font exposure decided | **decision needed** | section 4 |
| Real devices and screen readers | **not done** (no device lab here) | UAT |

Decision for the current state: **READY FOR UAT; NOT READY FOR PRODUCTION.**

## 4. Fonts

Shipped in this candidate (all SIL OFL 1.1, files and licences in `third-party-licenses/fonts/`): Be Vietnam Pro, Mona Sans,
Barlow Condensed, Dancing Script. Details and glyph-coverage evidence: `docs/design/FONTS.md`.

**Exposure that cannot be undone by a later commit.** `SVN-Bebas Neue Pro` and `SVN-Primark` were added to this branch earlier
(commit `9322650`, carried by `f9ef1c0`). Their web licence is unverified. They are no longer in the tree, but:

1. they remain in the **history of a public GitHub repository** (branch `claude/eloquent-meitner-pn6u2b`); and
2. they are served by the **current production deployment** `dpl_9jxuNc...` (`f9ef1c0`).

Rewriting shared history is outside the authority granted to engineering, and replacing the production deployment is a
production change. Options for the owner:

- confirm in writing that VBFA holds a web/redistribution licence for both fonts (then no action is needed beyond filing it); or
- if not confirmed: (a) Instant Rollback production to `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX` (does not contain the fonts), and
  (b) authorise purging the two binaries from the history of the branch (the branch is not merged, so deleting it after
  re-creating the candidate from a clean tree is the least invasive route; merged `main` never contained them).

## 5. Content and asset register

| Area | Status | Needed before indexing |
|---|---|---|
| Articles 1-3 | copy from the design hand-off (approval not recorded) | Marketing approval |
| Articles 4-10, all publication dates | **sample text and invented dates** | replace with real content or remove |
| Cover and in-article images (8 WebP files in `src/assets/seed/`) | **illustrations, not photographs of real events** (alt text says "Minh họa"); author and licence/provenance of the files are not recorded in the repository, and some may be machine-generated | owner records provenance and licence; never present them as real association events |
| Related-article cards | use brand drop artwork as placeholder by design | Marketing decision |
| Logo files | from the design hand-off | confirm usage rights |
| Contact details (email, phone, address), social links | **empty on purpose** (`contact: {}`, `social: []`) | owner supplies approved details in Sanity -> Site settings |
| `Privacy policy` page | **does not exist** | create in Sanity (static page) after legal approval |
| Typography choice | headings use Mona Sans per the mock-up, body Be Vietnam Pro (main V1.1 used Be Vietnam Pro throughout); two-line switch in `src/styles/tokens.css` | Marketing decision |
| Search-engine indexing | **off** | switch `PUBLIC_SITE_INDEXING=on` only after all rows above are closed |

## 6. Legal and privacy gates (no wording was invented here)

1. **Membership form**: consent sentence `join-v2` ("Tôi đồng ý để VBFA sử dụng thông tin này...") is a placeholder pending legal
   review. No personal data is collected until `LEADS_ENABLED=true` (the form answers `503` otherwise).
2. **Newsletter form**: there is **no visible consent or privacy notice** next to the address field; the client marks
   `consent: true` implicitly and the lead is stored with `consent_text_version = newsletter-action-v1`. Legal must decide
   the wording (and whether a checkbox is required). Engineering can add a CMS-editable notice field and a version string once
   the wording exists; until then keep `LEADS_ENABLED` off.
3. **Retention**: address hashes on leads are cleared after 30 days and the rate-limit counter after 2 days
   (`purge_lead_metadata`). Retention of the lead rows themselves (name, email, company) is **not defined**: client/legal decision.
4. **Access/deletion requests**: procedure in `docs/OPERATIONS.md` section B.6.
5. **Cookies and analytics**: none set by the site; `ENABLE_VERCEL_ANALYTICS` is off. Turnstile (Cloudflare) loads a
   third-party script and frame once configured: mention it in the privacy policy.

## 7. UAT access plan

Previews are behind Vercel Authentication, so reviewers need one of: (a) a Vercel team seat; (b) a *Shareable Link* created by
the owner for the exact deployment under review (keep it out of tickets and chat logs; revoke after UAT); (c) a custom domain
for a staging alias (changes the protection rules: the owner decides). Each page carries `<meta name="vbfa-build"
content="<sha>">` (view source) so a reviewer can confirm which commit they are looking at; reviewers should quote that
value in feedback.

UAT script: all pages x 9 widths (320-1920), keyboard-only pass, screen reader pass (NVDA/VoiceOver), reduced-motion setting,
slow-network profile, form dialogs (expect the documented 503 message while `LEADS_ENABLED` is off), the 404 page, the
`/tin-tuc` redirect, print preview of an article.

## 8. Production validation after an authorised release

```bash
SMOKE_BASE_URL=https://<production-host> SMOKE_EXPECT_SHA=<merged-sha> SMOKE_EXPECT_INDEXING=off \
  VERCEL_PROTECTION_BYPASS=<only-if-protected> node scripts/qa/smoke.mjs
```

Then: Lighthouse mobile on `/`, `/tin-tuc/` and one article (record the date, tool version and device profile); confirm the
rollback target is still listed as a rollback candidate; keep indexing off until section 5 is closed.
