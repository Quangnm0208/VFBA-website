#!/usr/bin/env node
/**
 * Convert the SIL-OFL web fonts (Mona Sans, Be Vietnam Pro) from TTF to subsetted WOFF2.
 *
 *   node scripts/build-fonts.mjs --src <dir with the original .ttf files>
 *
 * The SVN-Bebas Neue Pro and SVN-Primark files are NOT converted here: their web-font
 * licence still has to be confirmed with the rights holder (see docs/OPERATIONS.md), so
 * they are shipped untouched as OTF in src/assets/fonts.
 *
 * The subset covers Basic Latin, Latin-1, Latin Extended-A/B, Vietnamese (Latin Extended
 * Additional), combining marks, general punctuation, currency, arrows and basic maths.
 * OpenType layout features (mark positioning for Vietnamese diacritics) are retained.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import subsetFont from 'subset-font';

const args = process.argv.slice(2);
const srcDir = resolve(args[args.indexOf('--src') + 1] || 'design-sources/fonts');
const outDir = resolve('src/assets/fonts');

const ranges = [
  [0x0020, 0x007e], [0x00a0, 0x00ff], [0x0100, 0x024f], [0x0300, 0x036f],
  [0x1e00, 0x1eff], [0x2000, 0x206f], [0x20a0, 0x20bf], [0x2100, 0x214f],
  [0x2190, 0x21ff], [0x2212, 0x2212], [0x2248, 0x2248], [0x2260, 0x2265],
];
const text = ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => String.fromCodePoint(a + i))).join('');

const files = [
  'BeVietnamPro-Regular', 'BeVietnamPro-Medium', 'BeVietnamPro-SemiBold', 'BeVietnamPro-Bold',
  'MonaSans-Regular', 'MonaSans-Medium', 'MonaSans-Bold', 'MonaSans-SemiExpanded-SemiBold',
];

await mkdir(outDir, { recursive: true });
for (const name of files) {
  const input = await readFile(join(srcDir, `${name}.ttf`));
  const output = await subsetFont(input, text, { targetFormat: 'woff2' });
  await writeFile(join(outDir, `${name}.woff2`), output);
  console.log(`${name}.ttf ${Math.round(input.length / 1024)}KB -> ${name}.woff2 ${Math.round(output.length / 1024)}KB`);
}
