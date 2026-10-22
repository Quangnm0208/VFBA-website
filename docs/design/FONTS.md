# Web fonts — decision record and licences

Status: 2026-10-22. Applies to the Astro implementation. All fonts that ship with the site are licensed under the
**SIL Open Font License 1.1 (OFL)**; the licence texts are in `third-party-licenses/fonts/`.

## What ships

| Role | Family | Weights | Licence | Source of the TTF that was subset |
|---|---|---|---|---|
| Body, UI, digital headlines fallback | Be Vietnam Pro | 400 / 500 / 600 / 700 | OFL 1.1 | design handoff (`BeVietnamPro-*.ttf`), upstream `bettergui/BeVietnamPro` |
| Display headings (H1–H3) | Mona Sans (+ SemiExpanded SemiBold for H1/H2) | 400 / 500 / 700, 600 | OFL 1.1 | design handoff, upstream `github/mona-sans` |
| Labels: eyebrow, kicker, badge, index numerals | **Barlow Condensed** | 500 / 700 | OFL 1.1 | npm `@expo-google-fonts/barlow-condensed` (Google Fonts static TTF) |
| Signature script, 28 px and up | **Dancing Script** | 500 | OFL 1.1 | npm `@expo-google-fonts/dancing-script` (Google Fonts static TTF) |

Files are WOFF2 subsets (Basic Latin, Latin-1, Vietnamese, the punctuation/symbols the site uses; ranges in
`scripts/font-ranges.json`) produced by `scripts/build-fonts.mjs` and self-hosted through the Astro Fonts API (fingerprinted, `immutable`, preloaded where it
matters, metric-matched fallbacks). No third-party font host is contacted and every character shown on a page must be inside
the subset (`scripts/check_site.py` enforces both). The tight subset cut each file from ~35 KB to ~28 KB (11 files:
~385 KB -> ~315 KB), which is what moved the mobile LCP under 2.5 s (see `docs/QA.md`). Characters outside the ranges
(for example Polish or Czech letters in a partner's name) would render in a system font: extend the ranges and re-run the
script if the content needs them.

Provenance of the files added on 2026-10-22 (reproduce with `node scripts/build-fonts.mjs --src <dir> --only …`):

| Output (`src/assets/fonts/`) | sha256 of output | sha256 of source TTF |
|---|---|---|
| `BarlowCondensed-Medium.woff2` | `677634ef80ec91c8d3ec9d86fe7ea124e2214aad756b413a9363665c38a83e5a` | `27d58d15cead6f7679ec21d7dd23852f22f63babe80540ca2bb45e7dd7a22ddb` |
| `BarlowCondensed-Bold.woff2` | `9d60cebdbc72eeef3c12282442cf353d61eee6d4b2df85bb3e2dc0b248484cfe` | `53550669f93c07de6221e051905462f862066459eb50148268b5628104a58a30` |
| `DancingScript-Medium.woff2` | `62179b61b7a095e8b351cccc86e8231ca34d03e75a90c6115ef00c76140da988` | `d120f83f589938fa9412792d122d86f4c4c63fcce7186ddc8c7142cc094a269e` |

## Why the SVN fonts were removed

The design handoff used **SVN-Bebas Neue Pro** (labels) and **SVN-Primark** (script). Their web-embedding licence was
never confirmed by the rights holder (open item in `HANDOFF.md`), and the owner's `main` branch deliberately does not
publish them. They are proprietary: shipping them without a licence is a legal exposure, so they are no longer in the
source tree and `scripts/check_site.py` fails the build if a file matching `svn-*`, `BebasNeue*` or `Primark*` appears.

History note: the files were committed on this branch in `9322650` and were published by the production deployment
built from `f9ef1c0` (`dpl_9jxuNcjYNQcn9kdTXCZfqX5WcXnG`, `/assets/fonts/*.otf`). Removing them from the tree does not
remove them from Git history or from that already-built deployment. Replacing/rolling back that deployment is a
production action that needs the owner's authorisation (see the release notes in the pull request).

## Why not the substitutes chosen on `main` (V1.1)

`main` replaced the label face with the free **Bebas Neue** and the script with Be Vietnam Pro italic. Measured with
`fontkit` over the 117 code points the labels need (Vietnamese capitals, digits, separators):

| Candidate | Missing glyphs | Result |
|---|---|---|
| Bebas Neue (400) | **46 / 117** (Ơ Ư Ạ Ả Ấ Ầ Ẩ Ẫ Ậ Ắ …) | Vietnamese capitals fall back to another font *inside the same word* ("CHÍNH SÁCH · TRI THỨC", "BÀI NỔI BẬT") |
| Antonio (400) | 46 / 117 | same problem |
| Caveat (600) | 45 / 117 | same problem for the script line |
| Barlow Condensed 500 / 700 | 0 / 117 | complete |
| Barlow Semi Condensed, Oswald, Saira Extra Condensed | 0 / 117 | complete (wider / heavier / narrower than the original) |
| Dancing Script, Sriracha | 0 / 117 | complete |

Visual comparison against the original SVN artwork (same strings, 14–15 px, tracked uppercase): **Barlow Condensed**
has the closest width — the label rows wrap exactly like the original — and a similar DIN-style construction;
**Dancing Script** is the closest to Primark's handwritten character among the Vietnamese-complete script fonts
(Sriracha is chunky; Be Vietnam Pro italic loses the handwritten feel). This is an engineering substitution made for
licensing and glyph-coverage reasons, **not** a brand decision: Marketing must still approve the look.

## Open brand question (Marketing)

The brand guideline names Mona Sans and the SVN fonts for design-support material and **Be Vietnam Pro for
website/digital** (guideline p. 10, as summarised in `docs/BRAND_UI_QA.md`). The approved UI mock-ups use Mona Sans for
headings; the V1.1 branch on `main` used Be Vietnam Pro for headings. This build keeps the approved mock-up (Mona Sans
headings, Be Vietnam Pro body). Switching all headings to Be Vietnam Pro is a two-line change in
`src/styles/tokens.css` (`--font-display`, `--font-heading`); decide before the indexing switch.

## Returning to the SVN fonts (only with a written licence)

1. Obtain written permission covering web embedding (self-hosting, WOFF2 conversion, the site's domains).
2. Add the files to `src/assets/fonts/` and register them in `astro.config.ts` in place of Barlow Condensed /
   Dancing Script; point `--font-label` / `--font-script` in `src/styles/tokens.css` at the new variables.
3. Remove the corresponding patterns from the guard in `scripts/check_site.py` and store the licence in
   `third-party-licenses/`.

## OFL notes

- The OFL licence texts and copyright statements are included in `third-party-licenses/fonts/`.
- Mona Sans and Dancing Script declare Reserved Font Names. The WOFF2 files are format conversions with a character
  subset (outlines and metrics unchanged), the same practice used by Google Fonts and Fontsource. If counsel wants
  strict RFN compliance, replace the subsets with the unmodified upstream files (larger downloads).
