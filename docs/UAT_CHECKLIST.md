# VBFA UAT — acceptance checklist
| Area | Test | Current status |
|---|---|---|
| Build | `npm install && npm run build` on GitHub Actions | **PASS** — run 39610573357, 2026-10-21 |
| Deploy | Real Vercel URL returns 200 | Blocked by Vercel permission |
| CMS | Editor can save & publish `article` | Studio schema committed; awaiting Sanity project, Studio deployment, auth QA |
| CMS | Media uses Sanity CDN | Awaiting Sanity project/assets |
| Database | Approved VBFA Supabase schema applied | Not started |
| Form | Turnstile + server validation + stored lead | Awaiting credentials |
| UX | Menu, modal, tabs, keyboard & reduced-motion | Browser QA pending |
| Responsive | 320/375/390/430/768/1024/1440 | Browser QA pending |
| Content | Client confirms all facts, logo, photos | Pending |
| SEO | OG, metadata, sitemap, canonical domain | Pending domain/UAT |
Record defects with section, environment, expected/actual, screenshot, priority and owner.
