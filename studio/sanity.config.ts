import {defineConfig} from 'sanity';
import {structureTool} from 'sanity/structure';
import {visionTool} from '@sanity/vision';
import {schemaTypes} from './schemaTypes';
const projectId=process.env.SANITY_STUDIO_PROJECT_ID||'';
const dataset=process.env.SANITY_STUDIO_DATASET||'production';
if(!projectId)console.warn('SANITY_STUDIO_PROJECT_ID required to run Studio.');
export default defineConfig({name:'vbfa-studio',title:'VBFA Content Studio',projectId,dataset,plugins:[structureTool(),visionTool()],schema:{types:schemaTypes}});
