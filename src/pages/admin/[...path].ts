import type { APIRoute } from 'astro';
import { crmRoute } from '~/lib/server/crm/runtime';

// The CRM (Lead Inbox) runs as part of the same Vercel Function as /api/*; every other page stays prerendered.
// Gate: CRM_ENABLED=true plus Supabase credentials (src/lib/server/crm/runtime.ts). Nothing here is cacheable or indexable.
export const prerender = false;

export const ALL: APIRoute = ({ request, clientAddress }) => crmRoute({ request, clientAddress });
