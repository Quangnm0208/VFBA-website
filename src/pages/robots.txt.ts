import type {APIRoute} from 'astro';
export const GET:APIRoute=({url})=>{
 const isPreview=/\.vercel\.app$/.test(url.hostname);
 const body=isPreview?'User-agent: *\nDisallow: /\n':'User-agent: *\nAllow: /\n';
 return new Response(body,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
};
