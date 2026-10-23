import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';
import { SINGLETONS, structure } from './structure';
import { leadsTool, overviewTool, staffTool } from './portal/tools';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

// A real Sanity project is required. No placeholder credentials are committed.
if (!projectId) throw new Error('Missing SANITY_STUDIO_PROJECT_ID. Create the VBFA project at sanity.io and put its id in studio/.env.');

export default defineConfig({
  name: 'vbfa',
  title: 'VBFA · Cổng quản trị',
  projectId,
  dataset,
  // One sign-in for Content and Leads. 'token' makes the Studio keep the person's Sanity session token and use it as a bearer
  // token; the Leads tool sends that same token to the portal API, which asks Sanity who owns it (src/lib/server/crm/portal).
  auth: { loginMethod: 'token' },
  plugins: [structureTool({ structure, name: 'content', title: 'Quản trị nội dung' }), visionTool({ defaultApiVersion: '2026-10-01' })],
  tools: (previous, { currentUser }) => {
    // The query playground is a developer tool: customers' editors do not see it.
    const developer = currentUser?.roles.some((role) => role.name === 'administrator' || role.name === 'developer');
    return [overviewTool, ...previous.filter((tool) => tool.name !== 'vision' || developer), leadsTool, staffTool];
  },
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
