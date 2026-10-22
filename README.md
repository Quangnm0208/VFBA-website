# VBFA Frontend Motion — Vercel-ready Review Build

Built from the 2026-10-22 handoff `UI mockups for website (3).zip` — `design_handoff_vbfa_website/code/`.

## Scope
- **12 static routes:** `/`, `/tin-tuc/`, and ten article detail routes `/tin-tuc/<slug>/`.
- Responsive 390/834/1440px (also test 320/375/430/768/1024/1920px).
- Fully accessible baseline motion: hero entrance, hover transitions, reveal-on-scroll, cursor parallax, `prefers-reduced-motion` support, mobile drawer, search dialog, membership modal, filtering and history query parameters, table of contents and share links.
- Three photo/illustration categories now appear throughout article cards, serving responsive WebP images generated for this project. **Images are illustrative; they do not document a specific VBFA event or policy.**
- Demo forms validate only; no data collection. No CMS/database required for frontend review.
- Client-review protection: `noindex,nofollow` HTML meta + `robots.txt` Disallow all. **Remove/update both before public SEO launch on official domain.**
- Supplied font binaries have been **omitted** due to unverified redistribution rights. Fonts use open/licensed web hosting (Be Vietnam Pro, Mona Sans, Bebas Neue, Caveat), so typography may differ subtly from the handoff. Licensed font files can be deployed by the rights holder later.

## Deploy to Vercel
1. Upload/commit the full *contents* of this directory to the `main` branch of `Quangnm0208/VFBA-website` after reviewing that it replaces existing frontend entrypoints.
2. In Vercel, `Add New > Project > Import Git Repository`, select `Quangnm0208/VFBA-website` and branch `main`.
3. Choose **Other** framework preset; Project Root `./`; **no install/build command and no output directory**. Vercel serves static `index.html` plus `tin-tuc/**/index.html`.
4. Deploy and verify `/`, `/tin-tuc/`, `/tin-tuc/dong-luc-tuong-lai/`, overlays, tab filtering, the mobile menu, and uploaded images.
5. DO NOT set up Sanity or Supabase credentials yet; forms intentionally stay in demo mode.

## After client review
- Astro + Sanity + Supabase branches exist separately in GitHub. Port these static templates into Astro components and restore Sanity content sources; avoid replacing the high-fidelity UI with the older Astro scaffold.
- Replace sample titles, publication dates and repeated article body with approved editorial content; connect media to Sanity Assets CDN.
- Implement real opt-in forms via Vercel API + anti-spam + dedicated Supabase project with RLS before public collection.
- Configure real contact info, sitemap, canonical/OG, privacy and consent. Remove `noindex` and `robots.txt` Disallow for production indexing after content approval.
- Confirm licensing and final brand palette before public launch.

## Local QA
```
python3 -m http.server 8765
# http://localhost:8765/
```

No npm, React, Next.js, or Astro runtime is required for this design review build.
