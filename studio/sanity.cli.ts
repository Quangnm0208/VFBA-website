import {defineCliConfig} from 'sanity/cli';
export default defineCliConfig({
  api:{
    projectId:process.env.SANITY_STUDIO_PROJECT_ID,
    dataset:process.env.SANITY_STUDIO_DATASET||'production',
  },
  deployment:{
    // Can be added after initial Sanity hosted deploy, for reliable auto-updates.
    appId:process.env.SANITY_STUDIO_APP_ID || undefined,
  },
});
