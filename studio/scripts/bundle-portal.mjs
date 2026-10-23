#!/usr/bin/env node
/**
 * Bundles portal-api/portal.ts (and the CRM code it imports from ../src) into ONE self-contained ES module.
 *
 *   node scripts/bundle-portal.mjs <outfile>
 *
 * Bare imports (e.g. @supabase/supabase-js) are imported by files under ../src, so a plain upward lookup would end in the repository
 * root's node_modules; a Vercel project whose Root Directory is `studio` only installs studio/node_modules. `nodePaths` makes the
 * Studio's own dependencies the fallback, so the same command works on Vercel, in CI and on a laptop.
 * Reading ../src needs Vercel's "Include source files outside of the Root Directory in the Build Step" (on by default).
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Independent of the directory it is started from.
export const STUDIO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export async function bundlePortal(outfile) {
  await build({
    absWorkingDir: STUDIO_ROOT,
    entryPoints: ['portal-api/portal.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
    nodePaths: [join(STUDIO_ROOT, 'node_modules')],
    // The studio's own tsconfig only: the repository root's extends astro/tsconfigs/strict, which a studio-only install cannot resolve.
    tsconfig: join(STUDIO_ROOT, 'tsconfig.json'),
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outfile = process.argv[2];
  if (!outfile) {
    console.error('usage: node scripts/bundle-portal.mjs <outfile>');
    process.exit(2);
  }
  await bundlePortal(outfile);
}
