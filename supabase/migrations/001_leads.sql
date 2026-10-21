-- Apply only to a dedicated VBFA Supabase project, after client authorization.
create table if not exists public.website_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('contact', 'membership', 'newsletter')),
  name text,
  email text not null,
  company text,
  phone text,
  message text,
  consent boolean not null check(consent = true),
  consent_text_version text not null default 'v1',
  consent_at timestamptz not null default now(),
  source_page text not null default '/',
  status text not null default 'new' check(status in ('new','reviewing','closed','deleted')),
  created_at timestamptz not null default now()
);
create index if not exists idx_vbfa_leads_created on public.website_leads(created_at desc);
create index if not exists idx_vbfa_leads_email on public.website_leads(email);
alter table public.website_leads enable row level security;
revoke all on public.website_leads from anon, authenticated;
-- Backend uses a server-only Supabase service role key. Never put this in the browser.
