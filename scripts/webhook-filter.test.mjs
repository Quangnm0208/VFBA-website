import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The Sanity webhook (docs/OPERATIONS.md) rebuilds the site only for the document types it lists. A new document type
 * added to the Studio without updating the filter would publish into the void: the editor sees "Published", the website
 * never changes. This keeps the documented filter and the Studio schema in step.
 */
const root = new URL('../', import.meta.url);
const schemaDir = new URL('studio/schemaTypes/', root);

const documentTypes = readdirSync(schemaDir)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .flatMap((f) => {
    const src = readFileSync(new URL(f, schemaDir), 'utf8');
    return [...src.matchAll(/defineType\(\{\s*name:\s*'(\w+)',[^]*?\btype:\s*'(\w+)'/g)].filter((m) => m[2] === 'document').map((m) => m[1]);
  })
  .sort();

const ops = readFileSync(new URL('docs/OPERATIONS.md', root), 'utf8');
const documented = (ops.match(/Filter:\s*`_type in \[([^\]]+)\]`/)?.[1] ?? '')
  .split(',')
  .map((s) => s.trim().replace(/^"|"$/g, ''))
  .filter(Boolean)
  .sort();

describe('Sanity webhook filter', () => {
  it('finds the document types of the Studio schema', () => {
    expect(documentTypes).toEqual(['article', 'homePage', 'newsPage', 'page', 'popup', 'siteSettings']);
  });

  it('lists exactly the Studio document types, so every Publish and Unpublish triggers a rebuild', () => {
    expect(documented).toEqual(documentTypes);
  });

  it('every document type the website queries is covered', () => {
    const queries = readFileSync(new URL('src/lib/content/queries.ts', root), 'utf8');
    const queried = [...queries.matchAll(/\*\[_type == "(\w+)"/g)].map((m) => m[1]);
    expect(queried.length).toBeGreaterThan(0);
    for (const type of queried) expect(documented).toContain(type);
  });
});
