import type { APIRoute } from 'astro';
import { leadRoute } from '~/lib/server/runtime';

/** Vercel Function: membership interest form -> Supabase `website_leads`. */
export const prerender = false;
export const POST: APIRoute = leadRoute('membership');
export const ALL: APIRoute = leadRoute('membership'); // non-POST methods get a clean 405 JSON response
