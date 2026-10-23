# Evidence: real Sanity → webhook → Vercel Deploy Hook → Preview rebuild (2026-10-23)

All results below were observed on **real services**: the Sanity Content Lake (project `iqyx5ttc`, dataset `production`), the Sanity webhook and the Vercel
Deploy Hook created by the Owner, the Vercel build system and the protected Preview of the activation branch. Nothing here is a mock.

| Item | Value |
|---|---|
| Workflow | `VBFA CMS acceptance (real Sanity -> Vercel Preview)`, run `39918992928`, job `120299359193`, 07:37:23–07:47:57 UTC, started by the Owner's account adding the label `run-cms-acceptance` to PR #8 (the job removed the label afterwards) |
| Script | `scripts/qa/live-cms-e2e.mjs` at `248d802` (source SHA recorded in the run summary) |
| Target | branch alias `https://vfba-website-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app` (Vercel Authentication on; the runner used the Automation Bypass secret) |
| Credentials | repository secrets `SANITY_DEPLOY_TOKEN` (Editor rights: the write probe passed) and `VERCEL_PROTECTION_BYPASS`; neither printed (masked in the log) |
| Test run id | `mvknqei4`; every test document is `beta-e2e-mvknqei4*`, titled `[BETA TEST] …`, kicker `BETA TEST`; all removed at the end (0 left) |
| Result | **21 / 21 PASS** |

## Timeline (UTC) and what each Vercel build proves

| Time | Action in Sanity | Vercel deployment created by the webhook | Result on the Preview |
|---|---|---|---|
| 07:37:34 | draft `drafts.beta-e2e-mvknqei4` created | none (the webhook excludes drafts; the script waited 120 s) | article **404**, not in the listing: drafts are never public |
| 07:39:37 | **publish** (create published doc with a 1200×630 cover + delete the draft) | `dpl_HREUywSFiofAC5aVCJ8QttMdXjh8` 07:39:44, READY | article live after **31 s**: title, SEO title/description, canonical `/tin-tuc/beta-e2e-mvknqei4/`, listing, `search-index.json`, `sitemap.xml`; cover served by `cdn.sanity.io` (200, `image/*`); CSP `img-src` includes `cdn.sanity.io`; `robots.txt` = `Disallow: /` and the page is `noindex` |
| 07:40:10 | **update** (new title, `seo.noIndex = true`) | `dpl_AJxEohRTWMEUfjuvGtXV5iihQgfi` 07:40:17, READY | new title live after **31 s**; the article left the sitemap and carries `noindex` |
| 07:40:42 | **unpublish** (published doc deleted, draft kept) | `dpl_9f1sUxLpK7k4QVr6dffWBZGvd4RV` 07:40:49, READY | page **404** after **31 s**; gone from the listing and the search index |
| 07:41:14 | **delete** the draft and the test image | none (draft) | 0 documents left in the dataset |
| 07:41:17 | publish an **invalid** article (`category: "not-a-category"`; the Studio would block it, the API does not) | `dpl_HwPjeKqoH36bDSPFiAF2HuFr3htu` 07:41:24, **ERROR** | for **366 s** (18 polls) the Preview kept serving the last good deployment: home 200, listing 200, the invalid article never visible |
| 07:47:22 | delete the invalid document | `dpl_E93qSqZxEdgzeEyYihB1kduYaoVw` 07:47:30, READY | site healthy again |
| 07:47:25 | **label** the placeholder article (below) | `dpl_8tD9Hrrh8eGiF3VhMzgpf1m7mqCV` 07:47:37, READY | `[BETA TEST] Test-123` live on the listing after **30 s** |

### The failed build (read from Vercel, `list_deployment_events` of `dpl_HwPjeKqoH36bDSPFiAF2HuFr3htu`)

```
Invalid article "beta-e2e-invalid-mvknqei4" from Sanity:
✖ Invalid option: expected one of "news"|"activity"|"policy"
  → at category
Error: [BUILD_UTILS_SPAWN_1] Command "npm run build" exited with 1
```

The branch alias stayed on the previous READY deployment: after the failed build the alias `…-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app` pointed at
`dpl_9f1sUxLpK7k4QVr6dffWBZGvd4RV` (alias updated 07:41:06 UTC, i.e. before the failed build at 07:41:24; read with `get_alias` at about 07:42 UTC, after the failure; the script's polls then confirmed for 366 s that the site kept serving).
**Verdict: an invalid CMS document fails the build and the previous deployment keeps serving.**

## Placeholder content labelled as Beta test material

| Document | Before | After |
|---|---|---|
| article `ea2dbc1f-8ae3-4455-9736-0b5dcba45632` (slug `test`) | title `Test-123`, kicker `test` | title `[BETA TEST] Test-123`, kicker `BETA TEST · KHÔNG PHẢI TIN CHÍNH THỨC` |

The `newsPage` heading still reads `Test Test` (CONTENT-001 in `CMS_PREVIEW_2026-10-22.md`): the Owner/Marketing replaces it before any public release. Restore or edit the labelled article in the Studio at any time.

## What this does not prove

- Webhook delivery on **Production** (the hook and webhook are Preview-only; a Production hook is a Release B step).
- A Marketing user publishing in the Studio UI (the script writes through the API with the same mutations the Studio sends); the Owner's own Publish click earlier produced the `Test-123` page.
- Scheduled (future-dated) articles: the site only lists articles with `publishedAt <= build time`; see `docs/OPERATIONS.md` section E.
- Concurrent edits by several editors (each rebuild reads the dataset at build time, so the last build wins and is complete).
