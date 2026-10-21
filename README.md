# VBFA Website — Marketing UAT

This repository hosts the **Vietnam Biofuels Association (VBFA)** website preview for Marketing review. It is **not** the official production website.

## Preview scope
- Responsive website based on the UI/UX team's `UI mockups for website.zip`.
- Static, review-only web page, supplied as a self-contained `index.html` derived from the team's source.
- Interactive UI is powered by the team's design runtime and requires access to public CDNs for React, ReactDOM, Babel, and Google Fonts.
- Forms are **simulations**: no user submissions are sent or saved. Do not enter sensitive data.
- Article copy, images, and organization statements should be editorially reviewed before publication.

## How to review
Open the preview deployment URL from Vercel, test desktop/mobile menu, section navigation, tab/filter controls, and form validation. Report UI issues with device, viewport, steps to reproduce, and screenshots.

## Deployment
Connect this GitHub repository to a dedicated Vercel project. Use the **Other** framework preset with no build command; `index.html` is served as a static page. This repository is for review only. No Supabase, CMS, or production domain is connected.

## Source provenance
Source archive: `UI mockups for website.zip`, provided by the VBFA design team on 2026-10-21. The entry page was packaged into one portable HTML file for UAT and contains inlined styles, JavaScript runtime, and visual assets.

## Acceptance gates
1. Real Vercel HTTPS URL can be opened by Marketing.
2. Desktop and mobile layouts verified.
3. UI interaction tests recorded.
4. Final content, media licensing, typography, and contact forms reviewed before production.

## Known limitations
Browser-side runtime and CDN dependencies mean this is **not a production-optimized app**. For production, replace the design runtime with maintainable, compiled application code and connect form submissions to a secure backend.