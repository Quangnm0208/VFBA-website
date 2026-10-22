import type { APIRoute } from 'astro';
import { leadRoute } from '~/lib/server/runtime';

/** Vercel Function: newsletter opt-in -> Supabase `website_leads` (kind = newsletter). */
export const prerender = false;
export const POST: APIRoute = leadRoute('newsletter');
export const ALL: APIRoute = leadRoute('newsletter');
