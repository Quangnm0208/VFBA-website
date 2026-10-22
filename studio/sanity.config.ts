import {defineConfig} from 'sanity';
import {structureTool} from 'sanity/structure';
import {schemaTypes} from './schemaTypes';
import {vbfaStructure} from './structure';

const projectId=process.env.SANITY_STUDIO_PROJECT_ID;
const dataset=process.env.SANITY_STUDIO_DATASET||'production';

// A real Sanity project is required for local use and hosted deployments.
// No fake IDs or placeholder credentials are committed to Git.
if(!projectId)throw new Error('Missing SANITY_STUDIO_PROJECT_ID. Create the VBFA Sanity project and configure studio/.env.');

export default defineConfig({
  name:'vbfa-studio',
  title:'VBFA · Trung tâm nội dung',
  projectId,
  dataset,
  basePath:'/',
  plugins:[structureTool({structure:vbfaStructure})],
  document:{
    // Sanity Studio 6.17+: prevents duplicate Home/Settings and provides one-click editing.
    singletons:['homePage','siteSettings'],
  },
  schema:{types:schemaTypes},
});
