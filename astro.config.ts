import { defineConfig, envField, fontProviders } from 'astro/config';
import vercel from '@astrojs/vercel';

/**
 * Architecture (see docs/ARCHITECTURE.md):
 *  - Pages are prerendered at build time and served from the Vercel Edge Network (CDN).
 *  - Only src/pages/api/** opts out of prerendering (`export const prerender = false`): those routes
 *    run as Vercel Functions and are the only place that touches Supabase / secrets.
 *  - Content comes from Sanity at build time; a Sanity webhook triggers a Vercel deploy hook.
 */
const site =
  process.env.PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:4321');

type Face = { src: [string]; weight: number; style: 'normal' };
const face = (file: string, weight: number): Face => ({ src: [`./src/assets/fonts/${file}`], weight, style: 'normal' });
const font = (name: string, cssVariable: `--${string}`, variants: [Face, ...Face[]], fallbacks: string[]) => ({
  provider: fontProviders.local(),
  name,
  cssVariable,
  fallbacks,
  display: 'swap' as const,
  options: { variants },
});

export default defineConfig({
  site,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  // No Markdown/code blocks on this site; also silences Astro's Shiki-vs-CSP warning.
  markdown: { syntaxHighlight: false },
  adapter: vercel({
    webAnalytics: { enabled: process.env.ENABLE_VERCEL_ANALYTICS === 'true' },
    maxDuration: 10,
    staticHeaders: true,
  }),
  // Self-hosted open-licence (SIL OFL 1.1) fonts. Astro emits the @font-face rules,
  // preload links and metric-matched fallbacks; files are fingerprinted and cached immutably.
  fonts: [
    font('Be Vietnam Pro', '--font-be-vietnam', [
      face('BeVietnamPro-Regular.woff2', 400),
      face('BeVietnamPro-Medium.woff2', 500),
      face('BeVietnamPro-SemiBold.woff2', 600),
      face('BeVietnamPro-Bold.woff2', 700),
    ], ['Arial', 'sans-serif']),
    font('Mona Sans', '--font-mona', [
      face('MonaSans-Regular.woff2', 400),
      face('MonaSans-Medium.woff2', 500),
      face('MonaSans-Bold.woff2', 700),
    ], ['Be Vietnam Pro', 'sans-serif']),
    font('Mona Sans SemiExp', '--font-mona-semiexp', [face('MonaSans-SemiExpanded-SemiBold.woff2', 600)], ['Mona Sans', 'sans-serif']),
    // Label face (eyebrow, kicker, badge, index numerals). Replaces the proprietary SVN-Bebas Neue Pro, whose web
    // licence is unverified. Chosen for full Vietnamese coverage and matching width (docs/design/FONTS.md).
    font('Barlow Condensed', '--font-barlow-condensed', [
      face('BarlowCondensed-Medium.woff2', 500),
      face('BarlowCondensed-Bold.woff2', 700),
    ], ['Impact', 'sans-serif']),
    // Signature script (28px and up). Replaces the proprietary SVN-Primark.
    font('Dancing Script', '--font-dancing-script', [face('DancingScript-Medium.woff2', 500)], ['Segoe Script', 'cursive']),
  ],
  env: {
    schema: {
      // Public (inlined at build time)
      PUBLIC_SITE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SITE_INDEXING: envField.enum({ context: 'client', access: 'public', values: ['on', 'off'], default: 'off' }),
      PUBLIC_SANITY_PROJECT_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SANITY_DATASET: envField.string({ context: 'client', access: 'public', default: 'production' }),
      PUBLIC_SANITY_API_VERSION: envField.string({ context: 'client', access: 'public', default: '2026-10-01' }),
      // QA only: adds a demo pop-up to the *seed* content so the pop-up flow can be tested without a CMS.
      PUBLIC_SEED_DEMO_POPUP: envField.boolean({ context: 'client', access: 'public', default: false }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
      // Server only (Vercel Functions / build)
      SANITY_API_READ_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      IP_HASH_SALT: envField.string({ context: 'server', access: 'secret', optional: true }),
      FORM_ALLOWED_ORIGINS: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },
  security: {
    checkOrigin: true,
    // Astro hashes its own bundled scripts/styles; everything else must come from these origins.
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://cdn.sanity.io",
        "font-src 'self'",
        "connect-src 'self'",
        'frame-src https://challenges.cloudflare.com',
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
      ],
      // Cloudflare Turnstile (only loaded when PUBLIC_TURNSTILE_SITE_KEY is set) and Vercel Web Analytics.
      scriptDirective: { resources: ["'self'", 'https://challenges.cloudflare.com', 'https://va.vercel-scripts.com'] },
    },
  },
});
