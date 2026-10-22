#!/usr/bin/env node
/**
 * Convert the SIL-OFL web fonts (Be Vietnam Pro, Mona Sans, Barlow Condensed, Dancing Script) from TTF to
 * subsetted WOFF2.
 *
 *   node scripts/build-fonts.mjs --src <dir with the original .ttf files> [--only Name,Name]
 *
 * Sources and licences are recorded in docs/design/FONTS.md. Only fonts with a verified open licence may be
 * added here: the proprietary SVN-Bebas Neue Pro and SVN-Primark files must not be committed or served
 * (scripts/check_site.py fails the build if they appear).
 *
 * The subset (scripts/font-ranges.json) covers Basic Latin, Latin-1, Vietnamese and the punctuation/symbols the site
 * uses; OpenType layout features (mark positioning for Vietnamese diacritics) are retained. The input may be the
 * original .ttf or an already built .woff2, so the files in src/assets/fonts can be re-subset in place:
 *   node scripts/build-fonts.mjs --src src/assets/fonts
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import subsetFont from 'subset-font';

const args = process.argv.slice(2);
const srcDir = resolve(args[args.indexOf('--src') + 1] || 'design-sources/fonts');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const outDir = resolve('src/assets/fonts');

// Single source of truth shared with scripts/check_site.py.
const { ranges } = JSON.parse(await readFile(new URL('./font-ranges.json', import.meta.url), 'utf8'));
const text = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i))).join('');

const files = [
  'BeVietnamPro-Regular', 'BeVietnamPro-Medium', 'BeVietnamPro-SemiBold', 'BeVietnamPro-Bold',
  'MonaSans-Regular', 'MonaSans-Medium', 'MonaSans-Bold', 'MonaSans-SemiExpanded-SemiBold',
  'BarlowCondensed-Medium', 'BarlowCondensed-Bold', 'DancingScript-Medium',
].filter((name) => !only || only.includes(name));

await mkdir(outDir, { recursive: true });
for (const name of files) {
  const source = [`${name}.ttf`, `${name}.woff2`].map((f) => join(srcDir, f));
  const input = await readFile(source[0]).catch(() => readFile(source[1]));
  const output = await subsetFont(input, text, { targetFormat: 'woff2' });
  await writeFile(join(outDir, `${name}.woff2`), output);
  console.log(`${name}: ${Math.round(input.length / 1024)}KB -> ${name}.woff2 ${Math.round(output.length / 1024)}KB`);
}
