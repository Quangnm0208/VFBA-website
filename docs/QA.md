# QA: what is tested, how, and what the numbers are

Everything below is **lab data** from a sandbox, not field data (no real devices, no RUM). Re-measure on the deployed
Preview/production URL before sign-off; the procedure is the same.

## Suites

| Suite | Command | Covers |
|---|---|---|
| Type check | `npm run check` | Astro/TypeScript, 83 files |
| Unit tests | `npm test` (95) | lead handler (origin, size, honeypot, validation, 503 fail-closed, Turnstile, rate limit), logging redaction, content schema/seed, **Sanity loader against a fake Content Lake client (valid load, invalid document, failed request and empty dataset throw; home picks repaired; no-cover article; one or two articles; Production build without a CMS project is refused; a mock, not the real API)**, **Sanity webhook filter == Studio document types == types the site queries**, SEO, Supabase migration (PGlite), CSP route finaliser |
| Static build checks | `npm run build && python3 scripts/check_site.py` | routes, links/anchors, SEO tags, JSON-LD, indexing mode, self-hosted fonts, **restricted fonts absent**, **page text inside the font subset**, **CSP route matching Vercel's exact-path semantics for every page and the 404**, size budgets |
| Browser e2e | `node scripts/qa/serve.mjs 4322 &` then `node scripts/qa/e2e.mjs http://localhost:4322 [--popup]` | breakpoints, overlays and focus return, news filter/search/load-more/deep links, article tools, both forms (API mocked), pop-up, motion incl. reduced motion, **home filter hide + announcement, back-to-top out of the tab order, TOC focus, real 404 response with CSP, `/tin-tuc` redirect** |
| Responsive audit | `node scripts/qa/responsive.mjs http://localhost:4322` | 320/375/390/430/768/834/1024/1440/1920 x home/news/article/404: overflow (and the culprit), broken/distorted images, logo proportions, clipped text, touch targets, focus visibility, font errors, console/CSP errors, headings, drawer/search/join fit; PNG screenshots |
| Deployed smoke | `SMOKE_BASE_URL=<url> node scripts/qa/smoke.mjs` | real Vercel headers on `/`, `/tin-tuc/`, an article and unknown routes (404 + CSP), redirects, robots/indexing mode, http->https, API method/body/origin/size restrictions, fail-closed 503 on a deployment without credentials. Never writes a row. Runs in CI after a push to `main` (`live-smoke.yml`) |
| Core Web Vitals lab | `node scripts/qa/perf.mjs <url>` and Lighthouse (below) | LCP/CLS cold + warm, shifting elements |

The QA server (`scripts/qa/serve.mjs`) is a simulator; it matches CSP routes the way Vercel does (anchored regex on the
exact path) and reloads `config.json` after each build. Security headers are additionally verified on the **deployed**
Preview with `smoke.mjs` / the Vercel tooling, because a simulator can hide exactly the class of bug it models.

## Lab conditions for Core Web Vitals (the "agreed" profile)

- Lighthouse 13.5, mobile form factor, default simulated throttling (150 ms RTT, 1.6 Mbit/s, CPU x4), 412x823 at DPR 1.75.
- Site served over **HTTP/2 with Brotli** (`QA_TLS_KEY`/`QA_TLS_CERT` on `serve.mjs`), like Vercel.
- **Arial-metric fallback**: the generated fallback faces use `local("Arial")`. Chromium on a bare Linux box cannot
  resolve it although fontconfig maps Arial to Liberation Sans (metric-compatible). `QA_ARIAL_SHIM=liberation` points
  those faces at Liberation Sans so the lab matches Windows/macOS/iOS visitors (CSP is dropped in that mode only,
  because the rewritten inline styles no longer match their hashes). Without it CLS is overstated (see below).
- Cold cache, median of 5 runs. Local server, no CDN latency.

## Results (commit under test: see the PR; build marker `<meta name="vbfa-build">`)

Lighthouse mobile, median of 5:

| Page | Performance | Accessibility | Best practices | SEO | FCP | LCP (max) | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| `/` | 97 | 100 | 100 | 69* | 1.68 s | **2.43 s** (2.46) | 0 | 0 ms |
| `/tin-tuc/` | 99 | 100 | 100 | 69* | 1.20 s | **2.18 s** (2.23) | 0 | 0 ms |
| `/tin-tuc/dong-luc-tuong-lai/` | 98 | 100 | 100 | 69* | 1.36 s | **2.26 s** (2.30) | 0.0003 | 0 ms |

\* SEO 69 is the single `is-crawlable` audit: the site is `noindex` on purpose until launch approval.

Targets LCP <= 2.5 s and CLS <= 0.1 are met on all three pages. The margin on `/` is 0.07 s, so treat it as "at target",
not "comfortably under".

What it took (each step measured; before -> after, home / news / article LCP): baseline 3.1 / 3.0 / 3.2 s ->
right-sized images and lazy decorative art 2.7 / 2.4 / 2.6 s -> tighter font subsets 2.4 / 2.2 / 2.3 s. Lighthouse showed
the pages were bandwidth-bound: the first view loads almost every font file (~370 KB at 1.6 Mbit/s is ~1.8 s), and
images were served far above their displayed size (logo 31 KB for a 120 px logo; the featured image 114 KB). Two
experiments were rejected because they did not help: fewer font preloads (FCP got worse) and inlining the stylesheet.

Responsive audit (9 widths x 4 pages + overlays): **0 failures**. No horizontal overflow at any width, no broken or
distorted images, logo proportions intact, no clipped text, no undersized (<24 px) targets, one `<h1>` per page, visible
focus on the first 14 tab stops, no console/CSP errors, drawer/search/join dialogs fit and the join submit button is
reachable at 320 px. Informational: card-title links are 28-31 px tall at 834/1024 px (as specified by the design guide)
and desktop nav links are 41 px (WCAG 2.5.8 AA asks for 24 px; 44 px is the AAA recommendation).

### Re-measured on the reconciled head (activation branch, 2026-10-22, same profile as above)

Production-like build (no demo pop-up, no Turnstile key), Lighthouse mobile, HTTP/2 + Brotli, Arial shim, cold cache.

| Page | n | Performance | Accessibility | Best practices | SEO | FCP | LCP median (max) | CLS | TBT |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 5 (quiet machine) | 97 | 100 | 100 | 69* | 1.67 s | **2.42 s** (2.46) | 0 | 0 ms |
| `/tin-tuc/` | 3 | 99 | 100 | 100 | 69* | 1.23 s | **2.21 s** (2.21) | 0 | 0 ms |
| `/tin-tuc/dong-luc-tuong-lai/` | 3 | 98 | 100 | 100 | 69* | 1.38 s | **2.28 s** (2.31) | 0.0003 | 0 ms |

\* indexing is off on purpose. An earlier 3-run batch of `/` showed one LCP of 2.66 s while other work was running on the same
machine (median 2.41 s); the quiet 5-run repeat above has a maximum of 2.46 s. Treat the home page as "at target with ~0.05 s
margin", as before. The CDP profile (`scripts/qa/perf.mjs`, slow-4G, 4x CPU, 3 runs) gives cold LCP 1.1 s (home), 1.9 s (news),
1.8 s (article) and CLS <= 0.0003.

Other suites on this head: unit tests 71, compiled Function 57 checks (database emulated), browser e2e 117/117 (three runs in a row),
responsive audit without layout or focus failures (the only reports are `ERR_TUNNEL_CONNECTION_FAILED`, caused by the
sandbox blocking the Turnstile script; the CI runner has no such block).

### Desktop Lighthouse and re-measure (2026-10-23, head with the `ArticleHead` image-size fix)

Same lab profile (HTTP/2 + Brotli, Arial shim, cold cache, median of 3, production-like build without the Turnstile key). Desktop uses Lighthouse's `desktop` preset
(1350x940, no CPU/network throttling beyond the preset).

| Page | Form factor | Performance | Accessibility | Best practices | SEO | FCP | LCP median (max) | CLS | TBT |
|---|---|---|---|---|---|---|---|---|---|
| `/` | desktop | 100 | 100 | 100 | 69* | 0.39 s | 0.53 s (0.53) | 0.0001 | 0 ms |
| `/tin-tuc/` | desktop | 100 | 100 | 100 | 69* | 0.31 s | 0.49 s (0.50) | 0.0001 | 0 ms |
| `/tin-tuc/dong-luc-tuong-lai/` | desktop | 100 | 100 | 100 | 69* | 0.32 s | 0.52 s (0.55) | 0.0001 | 0 ms |
| `/` | mobile | 97 | 100 | 100 | 69* | 1.68 s | 2.43 s (2.45) | 0 | 0 ms |
| `/tin-tuc/` | mobile | 98 | 100 | 100 | 69* | 1.24 s | 2.22 s (2.23) | 0 | 0 ms |
| `/tin-tuc/dong-luc-tuong-lai/` | mobile | 98 | 100 | 100 | 69* | 1.38 s | 2.28 s (2.28) | 0.0003 | 0 ms |

\* indexing is off on purpose (`is-crawlable` is the only SEO audit that fails).

BUG-006 found by the desktop run (Low, fixed): on desktop article pages Lighthouse's `image-size-responsive` audit (best practices 96) flagged the decorative leaf in
the article header. CSS sizes that graphic by height (`height:104%`, 20 % opacity), so it renders about 538 px wide while `sizes` said 230 px and the browser chose the
320 px file. `sizes` now says `(min-width: 721px) 540px`, so desktop loads the 603 px file (+6.8 KB, eager but `fetchpriority=low`); best practices is 100 and the mobile
numbers above are unchanged (mobile keeps the 140 px size).

Same head: browser e2e 111/111, responsive audit 9 widths x 4 pages + overlays with no layout, overflow, image or focus failure (the only failures are `ERR_TUNNEL_CONNECTION_FAILED`,
the sandbox proxy blocking the Cloudflare Turnstile script when a dialog opens; the CI runner has no such block).

### CRM screens (2026-10-23, `@ 8fa5abf`, MÔ PHỎNG: compiled Function on a local stack with demo data)

Same Lighthouse 13.5 profiles, run against the compiled Vercel Function (`scripts/qa/crm-stack.mjs`, persistent local server, signed-in session for the three inner screens), median of the successful runs (n = 3 unless noted).
This measures the markup, CSS and headers of the CRM, **not** Vercel or Supabase latency; the real-Preview numbers come from the `run-preview-qa` workflow (below, once run).

| Screen | Form factor | Performance | Accessibility | Best practices | SEO | FCP | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|---|
| login | mobile | 100 | 100 | 100 | 45* | 0.75 s | 0.90 s | 0 | 0 ms |
| inbox | mobile | 100 | 100 | 100 | 45* | 0.91 s | 1.05 s | 0 | 0 ms |
| lead detail | mobile | 100 | 100 | 100 | 45* | 0.75 s | 0.90 s | 0 | 0 ms |
| staff (admin) | mobile | 100 | 100 | 100 | 45* | 0.76 s | 0.91 s | 0 | 0 ms |
| login | desktop | 100 | 100 | 100 | 45* | 0.21 s | 0.24 s | 0 | 0 ms |
| inbox | desktop | 100 | 100 | 100 | 45* | 0.24 s | 0.28 s | 0 | 0 ms |
| lead detail | desktop | 100 | 100 | 100 | 45* | 0.20 s | 0.24 s | 0 | 0 ms |
| staff (admin) | desktop | 100 | 100 | 100 | 45* | 0.20 s | 0.24 s | 0 | 0 ms |

\* `is-crawlable` fails **on purpose** (`noindex` + `X-Robots-Tag` + `robots.txt` disallow): the CRM must never be indexed.
Two desktop runs (login n = 2, lead detail n = 2) ended with Lighthouse's `NO_NAVSTART` trace error under load and were not retried into the median; the remaining runs agree to the digit.
The CRM browser suite (`scripts/qa/crm-browser.mjs`, 37 checks) adds axe-core WCAG 2.2 A/AA on every screen (0 violations), keyboard-only sign-in and workflow, 8 widths from 320 px to 1920 px with no document overflow, and 400 % zoom.
Not covered by any of this: screen readers, real phones, assistive-technology users (see "Known limits").

## CLS investigation (earlier report: 0.149 on an article page)

Reproduced and explained. The number depends on whether the visitor's device has an Arial-compatible font:

| Environment | Article page CLS | Notes |
|---|---|---|
| Arial-metric fallback (Windows, macOS, iOS; Android if `local("Arial")` resolves to Roboto) | **0.0004** | agreed profile |
| No usable `local("Arial")` (bare Linux sandbox, what produced the earlier figure) | 0.172 | one shift at ~1.9 s |

Shifting element in the second case: `.article-head .tags` (badge "VBFA / INSIGHTS" + kicker "TIN NGÀNH · GÓC NHÌN"). With
the unadjusted system fallback the row is 57 px high (the kicker wraps to a second line); when Barlow Condensed arrives
it is 31 px, so the H1, the meta line and the cover image move up 26 px. Root cause: fallback glyphs wider than the
web font, in a flex row that wraps. The metric-matched fallback generated by Astro removes the difference on devices that
have Arial.

Risk: visitors whose browser cannot resolve `local("Arial")` (not verified on real Android devices here) could see up to
~0.17 on article pages. Mitigations if field data shows it: `font-display: optional` for the label face (no swap, the
first view keeps the fallback), or reserve the two-line height for `.tags` on narrow screens. Neither was applied because
the first costs brand fidelity on slow first visits and the second adds a visible gap. Re-check with real-user data
(CrUX / Vercel Speed Insights) after launch.

## Known limits

- Dependency advisories (`npm audit --omit=dev`, 2026-10-22): the website reports **3 high**, all one chain: `path-to-regexp`
  (backtracking regular expression, GHSA-9wv6-86v2-598j) <- `@vercel/routing-utils` <- `@astrojs/vercel@11.0.16` (the latest
  published adapter). `npm audit` offers `@astrojs/vercel@8.0.4`, which is a downgrade of three majors, so it is not a fix. The
  package is used by the adapter at build time to rewrite the route table; it is absent from the built Function bundle
  (`grep -r path-to-regexp .vercel/output/functions` finds nothing) and handles no visitor input. Track the upstream release. The Studio reports 18 (9 moderate, 9 high), all transitive
  inside `sanity`; the Studio is built to static files and served by Sanity, nothing from it runs on our servers. Re-run
  `npm audit` before the release and after each dependency update.
- Synthetic lab data; nothing here replaces real-device testing (iOS Safari, Android Chrome) or screen-reader testing.
- Lighthouse's simulation models HTTP/2 priorities; real Vercel behaviour (HTTP/3, CDN, `fetchpriority`) should be at
  least as good, but that is an expectation, not a measurement.
- Seed content only: once articles come from Sanity their images are served by the Assets CDN with `srcset`, which
  changes LCP (re-measure after content is loaded).
- The sandbox cannot reach `*.vercel.app`; deployed-URL checks were made with the Vercel tooling and, in CI, with
  `smoke.mjs`.

## Security hardening verification (22/10/2026)
- Explicit newsletter opt-in checkbox is mandatory and displayed next to the email field; a submit with `consent:false` or an unapproved version is rejected with HTTP 400 before storage.
- Both Turnstile keys (`PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`) and `IP_HASH_SALT` are required for `LEADS_ENABLED=true` to create the Supabase store. Any missing credential makes both form endpoints return 503.
- Only GitHub CI uses the fixed Cloudflare dummy credentials with a stubbed Siteverify fetch, never production credentials. Server-side real verification is still required in end-to-end UAT.
- Migration 0001 explicitly grants `INSERT` to `service_role`, independent of Supabase project default privileges; exposed anonymous/authenticated roles have no access.
- **No live Sanity project, Supabase database or client PII has been created or modified during this hardening phase.**
