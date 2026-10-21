# Deployment — VFBA Marketing Preview

## GitHub repository
https://github.com/Quangnm0208/VFBA-website

**Review branch:** `review/marketing-uat-20261021`  
**Live website:** `index.html`  
**Responsive review UI:** `review.html`  
**Original team design sources:** `source/*.dc.html`.

## Deploy to Vercel
1. Ensure the Vercel account/connector has permission to manage the `quangnm` team/scope and GitHub repository `Quangnm0208/VFBA-website`.
2. Create a new, separate Vercel project (e.g. `vbfa-marketing-uat`), connect this GitHub repo. Never reuse existing production projects.
3. Set Framework Preset **Other**; no install or build command and project root `./`.
4. Set the preview branch to `review/marketing-uat-20261021`. Vercel should build a preview deployment and assign a real `*.vercel.app` URL.
5. Open **/** and **/review.html** on the **deployed** URL. Verify successful load on desktop/mobile.
6. Share the actual verified HTTPS URL with Marketing. Do not invent a Vercel URL.
7. Enable Vercel preview feedback and choose appropriate preview access protection if content is confidential.

## Static/preview-only limitations
- The site is a portable HTML package from the original mockup, using a browser design runtime and CDN-provided React 18, ReactDOM, Babel and web fonts.
- Requires Internet access. Does not include API keys, CMS, Supabase, or server functions.
- Form buttons simulate user interaction only; nothing is persisted or emailed.
- The review project has `X-Robots-Tag: noindex, nofollow, noarchive`. Do not use these rules unchanged for future production SEO.
- For production, compile the site into maintainable frontend code and replace image-editing placeholders with finalized imagery; confirm font/image licenses.

## Connection blocker (2026-10-21)
Creating a Vercel project through the connected Vercel account was denied: HTTP 403, scope `quangnm`, team ID `team_xdGThOzAbkQKYQyEjNkCeGWd`. Reconnect/grant the Vercel integration permission for this team, then retry deployment.
