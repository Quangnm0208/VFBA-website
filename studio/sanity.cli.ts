import { defineCliConfig } from 'sanity/cli';

const projectId = process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';

export default defineCliConfig({
  api: { projectId, dataset },
  // Studio is hosted by Sanity at https://<studioHost>.sanity.studio (deployed as vbfa-site by the `VBFA Sanity Studio deployment` workflow).
  studioHost: process.env.SANITY_STUDIO_HOST || 'vbfa-site',
  // appId identifies the already-deployed Studio (public identifier, not a credential): it makes `sanity deploy` non-interactive.
  // On Vercel (the Admin Portal) every module is bundled and served from our own origin: no third-party script at run time and a
  // build that does not change by itself. The Sanity-hosted fallback keeps Sanity's automatic updates; CI builds offline
  // (STUDIO_AUTO_UPDATES=false) so the check does not depend on Sanity's CDN.
  deployment: { autoUpdates: process.env.VERCEL ? false : process.env.STUDIO_AUTO_UPDATES !== 'false', appId: 'nhd1abiv9lwcm8znebpveme5' },
});
