> **Ghi chú:** tài liệu này ghi lại các quyết định thương hiệu/UX của bản tĩnh V1.1 trên `main` (chủ dự án). Bản Astro kế thừa các cải tiến truy cập (lọc ẩn + thông báo số kết quả, nút về đầu trang rời thứ tự Tab, mục lục chuyển focus). Về font: xem `docs/design/FONTS.md` (Bebas Neue thiếu glyph tiếng Việt nên không dùng cho nhãn). Các kết quả CI/PR #5 nêu bên dưới thuộc về bản tĩnh.

# VBFA Frontend — Brand & UX Conformance (2026-10-22)

## Sources and scope
1. Original design source: `UI mockups for website (3).zip`.
2. Original branding: `Draft Guideline - VBFA.pdf` supplied for this project (21-page export).
3. Public design review: 12 static HTML routes at `/` and `/tin-tuc/**`.

## Brand requirements that have explicit basis in the guideline
| Guideline | PDF pages | Implementation |
|---|---|---|
| Distinct horizontal/vertical logo grid and preservation of logo proportions | pp. 1–5 | Existing official image variants retained; `.logo img` keeps aspect ratio and `object-fit:contain` |
| Mona Sans, SVN-Bebas Neue Pro variants and SVN-Primark for design-support applications | pp. 7–9 | Not published as bundled typefaces because redistribution permission is not established. Open-source Bebas Neue is an explicitly non-identical substitute on metadata labels |
| **Be Vietnam Pro for WEBSITE/DIGITAL** | p. 10 | Digital headlines, navigation, text, controls and emphasis use Be Vietnam Pro, with Arial/system fallback |
| Green-leaf, deep-forest and gold energy identity | p. 17 | Existing color family preserved. Source visual contains swatches, not an authoritative full HEX token specification |
| Graphic motifs/light trails on deep greens | pp. 18–21 | Existing abstract decoration retained but motion reduced on small viewports and reduced-motion devices |

## Implementation tokens — NOT claimed to be official guideline specifications
- Horizontal content max width: 1280px; responsive gutter and section gaps.
- Corners: 6px controls, 12px cards, larger leaf-shaped media corners.
- Elevation: restrained header and content-card shadows.
- Timing: interaction 250–500ms; entrance/reveal animation remains optional.
- Mobile breakpoints: 1040px, 900px, 720px, 375px.
- Reduced motion: reveal effects, floating graphics, parallax and smooth scroll are suppressed when requested.

## UX corrections included in this branch
- Desktop/tablet/mobile typography normalized to the digital brand face.
- Header logo constrained without distorting official artwork.
- Hero and news card rhythm adapted for mobile; footer, newsletter, dialog and form controls no longer compete for narrow widths.
- Homepage category chips now hide nonmatching editorial cards (was dim-only); screen reader receives result count.
- Search result "Liên hệ" now links to homepage anchor from any news/article path.
- Reduced-motion behavior corrected for article table-of-contents links.
- Hidden "back to top" control removed from keyboard tab flow until it becomes visible.
- No external design-runtime dependencies; forms remain demos, with truthful no-storage messages.

## Items intentionally not classified as verified
- Supplied guideline does not assign web spacing/radius/shadow specifications.
- The existing logo file's rights must be confirmed by the owner; no standalone font binaries have been republished.
- Three category images are illustrative and should not be presented as evidence of real association events.
- Editorial copy, contact details, privacy policy, legal claims and partner list still require client sign-off.
- Headless browser navigation was blocked in the authoring runtime with `ERR_BLOCKED_BY_ADMINISTRATOR`, so automated pixel-level responsive QA and Lighthouse are NOT certified.
- Until official launch approval, HTML remains `noindex,nofollow` and robots.txt stays Disallow All. Remove both for search indexing only after approved canonical domain/content.

## Verification evidence
- `scripts/validate_frontend.py`: validates 12 routes, local assets/anchors, image alt attributes, a single H1 per page, descriptions, digital tokens and JS syntax.
- [Brand & Frontend QA GitHub Actions](https://github.com/Quangnm0208/VFBA-website/actions/runs/39730398937): PASS
- [Frontend Static QA GitHub Actions](https://github.com/Quangnm0208/VFBA-website/actions/runs/39730399095): PASS
- PR [#5](https://github.com/Quangnm0208/VFBA-website/pull/5) is draft. No production merge or deployment claimed.

## Release checklist for Marketing review
- [ ] Viewport 320 / 375 / 390 / 430 / 768 / 1024 / 1440 / 1920 — no text clipping or horizontal scrolling.
- [ ] Mobile menu, search overlay, newsletter preview, join modal, tabs, scrolling and focus trapping.
- [ ] Footer/navigation anchors from all routes.
- [ ] Check final fonts and logo clear space on Chrome/Edge desktop and Safari/Chrome mobile.
- [ ] Lighthouse performance/accessibility on the **deployed Preview URL**.
- [ ] Approve content, photos, license and personal-data policy before enabling real forms.
