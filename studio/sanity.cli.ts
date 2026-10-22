import { defineCliConfig } from 'sanity/cli';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineCliConfig({
  api: { projectId, dataset },
  // Studio is hosted by Sanity at https://<studioHost>.sanity.studio (deployed as vbfa-site by the `VBFA Sanity Studio deployment` workflow).
  studioHost: process.env.SANITY_STUDIO_HOST || 'vbfa-site',
  // appId identifies the already-deployed Studio (public identifier, not a credential): it makes `sanity deploy` non-interactive.
  deployment: { autoUpdates: true, appId: 'nhd1abiv9lwcm8znebpveme5' },
});
