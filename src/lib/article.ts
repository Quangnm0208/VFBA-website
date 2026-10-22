import { slugify } from './format';
import type { PortableBody } from './content';

export interface Heading { id: string; text: string }

const blockText = (b: PortableBody[number]): string => (b._type === 'block' ? b.children.map((c) => c.text).join('') : '');

/** H2 headings with unique anchor ids, in document order (drives both the table of contents and the prose). */
export function extractHeadings(body: PortableBody): Heading[] {
  const seen = new Map<string, number>();
  return body
    .filter((b) => b._type === 'block' && b.style === 'h2' && !b.listItem)
    .map((b) => {
      const text = blockText(b).trim();
      const base = slugify(text) || 'muc';
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { id: n === 1 ? base : `${base}-${n}`, text };
    });
}
