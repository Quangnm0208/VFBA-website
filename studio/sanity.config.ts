import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';
import { SINGLETONS, structure } from './structure';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

// A real Sanity project is required. No placeholder credentials are committed.
if (!projectId) throw new Error('Missing SANITY_STUDIO_PROJECT_ID. Create the VBFA project at sanity.io and put its id in studio/.env.');

export default defineConfig({
  name: 'vbfa',
  title: 'VBFA · Trung tâm nội dung',
  projectId,
  dataset,
  plugins: [structureTool({ structure }), visionTool({ defaultApiVersion: '2026-10-01' })],
  schema: {
    types: schemaTypes,
    // Settings / home / news-page exist exactly once: hide them from the "create" menu.
    templates: (templates) => templates.filter(({ schemaType }) => !SINGLETONS.includes(schemaType)),
  },
  document: {
    // ...and remove actions that would duplicate or delete them.
    actions: (input, { schemaType }) => (SINGLETONS.includes(schemaType) ? input.filter(({ action }) => action && !['unpublish', 'delete', 'duplicate'].includes(action)) : input),
  },
});
