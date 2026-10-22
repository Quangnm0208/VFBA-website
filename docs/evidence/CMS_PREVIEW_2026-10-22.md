# Evidence: Sanity CMS connected to the activation Preview (2026-10-22)

Scope: Phase 1 of the production-completion plan. Everything is labelled **REAL** (observed on the live Sanity project
`iqyx5ttc` / dataset `production`, the Vercel Preview and the hosted Studio) or **STATIC** (read from the repository, not
exercised against a live service). Nothing here involves the Production deployment or any Production variable.

## 1. Branch and commit trail (no history rewritten, nothing merged into `main`)

| Step | Commit | Note |
|---|---|---|
| PR #10 merged into the activation branch (not `main`) | `b90019c` | merge commit; PR #10's own CI had passed on `70650c3` |
| Preview build of that merge failed on real data | n/a | `Invalid article "test" from Sanity ... at cover: expected object, received undefined` (BUG-001) |
| Fix: article without a cover falls back to the brand image | `f70b3f1` | CI run 72 (pull_request) **success** |
| Fix: no empty contents / prev-next / related blocks with one article | `eaf9baf` | see BUG-002 |
| Fix: a Production build can no longer publish sample news | this commit | see BUG-003 |

## 2. REAL: the Preview built from the real Content Lake

Deployment `dpl_DtKHnUzt6AgMN749gNReTqrzwTDy`, commit `f70b3f1`, branch `feat/vbfa-services-activation-20261022`,
region `sin1` (functions) / build in `iad1`, state READY, target preview (not Production).
URL: `https://vfba-website-cl92e56ac-quangnm.vercel.app` (protected by Vercel Authentication; fetched through the connector).

Build log (Vercel deployment events), in order:

- `Cloning ... (Branch: feat/vbfa-services-activation-20261022, Commit: f70b3f1)`
- `[content] article "test" has no cover image in Sanity: using the default brand image. Upload a cover in the Studio.`
- prerendered routes: `/404.html`, `/robots.txt`, `/search-index.json`, `/sitemap.xml`, `/tin-tuc/test/index.html`, `/tin-tuc/index.html`, `/index.html`
- `finalize-vercel-output: Content-Security-Policy routes match every page and the 404 response.`
- `Deployment completed`

The route list contains exactly one article page (`/tin-tuc/test/`): the sample articles are not present, so the build used
the Content Lake and nothing else.

Rendered output (HTML fetched from the Preview):

| Check | Result |
|---|---|
| Build marker | `<meta name="vbfa-build" content="f70b3f1">` |
| `/tin-tuc/test/` | `200`; `<title>Test-123 \| VBFA</title>`; H1 `Test-123`; kicker `test`; date `22/10/2026`; "1 phút đọc"; lede and body paragraph from the CMS; JSON-LD `NewsArticle` + `BreadcrumbList` |
| `/tin-tuc/` | `200`; featured card and list card both link to `/tin-tuc/test/`; counter "1 bài viết"; page heading comes from the published `newsPage` document (eyebrow `Test`, title `Test Test`, lead `Test`) |
| `/` | `200`; the news section holds exactly one card (`Test-123`), no invented articles |
| Cover image | the article has no cover in Sanity, so `/og-default.png` (1200x630) is used; no broken image |
| Drafts | none rendered (client uses `perspective: 'published'`, `useCdn: false`) |
| Indexing | `<meta name="robots" content="noindex,nofollow">` and `x-robots-tag: noindex` on all three pages |
| Headers | `content-security-policy` (includes `img-src ... https://cdn.sanity.io`), `strict-transport-security: max-age=63072000; includeSubDomains`, `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` |

Not observable from the rendered HTML and therefore **not claimed**: whether the Sanity `homePage` and `siteSettings`
singletons are published (the hero and footer text equal the repository defaults, which the loader also uses when a
singleton is missing), and the exact Preview environment values (the connector cannot list environment variables; the
build reading the real Content Lake and the `noindex` headers are consistent with `PUBLIC_SANITY_PROJECT_ID`,
`PUBLIC_SANITY_DATASET` and `PUBLIC_SITE_INDEXING=off`, but `LEADS_ENABLED=false` is **not verified** here).

## 3. REAL: Studio redeployed from the reviewed source

Workflow `VBFA Sanity Studio deployment`, run `39807604001`, job `119924903483`, started 2026-10-22 15:44 UTC, secret
`SANITY_DEPLOY_TOKEN` taken from the `vbfa-cms` environment (never printed). It checked out the activation branch
(the `studio/` directory is identical in `f70b3f1` and `eaf9baf`).

| Step | Result |
|---|---|
| `tsc --noEmit` (Studio) | success |
| `sanity schema validate` | **0 errors, 0 warnings** |
| `sanity build` | success |
| `sanity deploy --schema-required --url vbfa-site` | `Deployed 1/1 schemas`; `Success! Studio deployed to https://vbfa-site.sanity.studio/` |

Why it was redeployed: the Studio source changed after the first deployment (home page highlights 1-3 articles, cover must
contain an uploaded file, slug validation mirrors the site rule). The deployment printed the application id of the Studio;
it is a public identifier (not a credential) and is now pinned in `studio/sanity.cli.ts`.

## 4. STATIC: the six document types

| Type | Singleton | Slug | Portable Text | SEO | References | Images | Scheduling | Validation |
|---|---|---|---|---|---|---|---|---|
| `article` | no | `slug` with regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` and an auto-generator that strips Vietnamese diacritics | `articleBody`: paragraph, H2, bullet list, bold/italic, https/mailto/tel links, figure (image + required alt), callout | `seo` object (title, description, canonical, OG image, noindex) | none | cover must contain an uploaded file + required alt (hotspot); figure images require alt | `publishedAt` (required); the site lists an article only when `publishedAt <= now()` **at build time** | title 8-160, excerpt 30-320, category, kicker, body >= 1 block |
| `page` | no | same regex + reserved words (`tin-tuc`, `api`, `search-index`, `sitemap`, `robots`) | `articleBody` | `seo` | none | via body figures | none (published = live after the next build) | title, slug, body >= 1 block |
| `homePage` | yes (id = type) | n/a | n/a | `seo` | `news.picks[].article` -> `article` (1-3, required) | via fields | n/a | picks `min(1).max(3)`; the loader drops picks whose article is not published and completes up to 3 with the newest articles |
| `newsPage` | yes | n/a | n/a | `seo` | none | none | n/a | all four heading fields required |
| `siteSettings` | yes | n/a | n/a | `seo` | `forms.privacyPage` -> `page` (dropped by the loader if that page is not published) | none | n/a | names, footer texts, consent text/version, email format, https-only social links |
| `popup` | no | n/a | n/a | n/a | none | optional image + required alt | `startsAt`/`endsAt` (end after start); evaluated in the visitor's browser, not at build | heading, CTA label/URL rules by action, delay 3-120 s, scroll 10-90 % |

Singleton protection: `homePage`, `newsPage`, `siteSettings` are removed from the "create" menu and their delete /
unpublish / duplicate actions are filtered out (`studio/sanity.config.ts`, `studio/structure.ts`).

Loader behaviour covered by unit tests against a fake Content Lake client (a mock, **not** the real API): valid load, invalid
document fails the build, failed request fails the build, empty dataset fails with a precise message, no-cover article, one or
two articles, a pick that points to an unpublished article, the client options (project, dataset, version, published
perspective, no API CDN).

## 5. Content policy (decided and enforced)

1. Sanity configured -> the Content Lake is the only source. An invalid document, a failed request, or an **empty dataset**
   fails the build with a message that names the cause; Vercel then keeps the previous deployment live.
2. Sanity not configured -> the built-in sample set, for development and Preview only, with a warning in the build log.
3. **A Production build (`VERCEL_ENV=production`) without a Sanity project is refused** (BUG-003). Verified locally:
   `VERCEL_ENV=production npm run build` exits 1 with `Production build refused: PUBLIC_SANITY_PROJECT_ID is not set ...`;
   `VERCEL_ENV=preview npm run build` exits 0 and logs `building with the built-in SAMPLE content`.
4. An article without a cover is published with the brand image and a warning naming the article (the Studio now asks for one).

## 6. Bug log (this phase)

| ID | Severity | Finding | Reproduction | Status / fix |
|---|---|---|---|---|
| BUG-001 | High | Preview build failed on real data: a published article without a cover image aborted the whole build | Vercel build of `b90019c`: `Invalid article "test" ... at cover` | Fixed `f70b3f1`; Preview READY with the real article |
| BUG-002 | Low | With one article, the article page rendered an empty contents list, an empty prev/next bar and a related-articles heading with no cards | `/tin-tuc/test/` on the `f70b3f1` Preview | Fixed `eaf9baf`. **REAL**: Preview `dpl_HKjRQFhqV253KZvM5MtJt8y4z1Xq` (`vbfa-build` = `eaf9baf`) serves `/tin-tuc/test/` with `article-grid article-grid--single` and no contents list, no prev/next bar, no related section. Also verified locally on a one-article build and unchanged on the sample set (6 articles) |
| BUG-003 | Medium | A Production build without `PUBLIC_SANITY_PROJECT_ID` would silently publish the six sample articles as real news | read of `src/lib/content/index.ts` | Fixed (this commit) + 4 unit tests + real-build proof above |
| BUG-004 | Info | `canonical`, `og:url`, `og:image` and JSON-LD on a Preview point to `vfba-website-alpha.vercel.app` | any Preview page | By design (site origin = `PUBLIC_SITE_URL` or the project's production URL); harmless while `noindex`. Set `PUBLIC_SITE_URL` for Production when the custom domain is attached |
| BUG-005 | Info | `/tin-tuc/` with one article shows the featured card and "1 bài viết" with an empty area under the toolbar | `/tin-tuc/` on the Preview | Open, cosmetic, resolves itself with more articles; not changed (no redesign) |
| CONTENT-001 | Medium (content, not code) | The published `newsPage` document and the article hold placeholder text (`Test`, `Test-123`) | Preview `/tin-tuc/` | Owner/editor must replace before any public release |

## 7. Reproduce

```bash
export PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA   # Cloudflare public test key, build-time only
npm test                                   # 94 tests
npm run check && npm run build && python3 scripts/check_site.py
VERCEL_ENV=production npm run build        # must fail: no CMS project configured
(cd studio && SANITY_STUDIO_PROJECT_ID=iqyx5ttc npm run typecheck && SANITY_STUDIO_PROJECT_ID=iqyx5ttc npm run validate)
```
