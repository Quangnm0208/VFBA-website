import { defineCliConfig } from 'sanity/cli';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineCliConfig({
  api: { projectId, dataset },
  // Studio is hosted by Sanity at https://<studioHost>.sanity.studio (set once with `npm run deploy`).
  studioHost: process.env.SANITY_STUDIO_HOST || 'vbfa',
  deployment: { autoUpdates: true },
});
