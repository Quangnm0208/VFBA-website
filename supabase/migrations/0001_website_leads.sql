-- VBFA website leads (membership interest + newsletter opt-in).
--
-- Data boundary: this database holds BUSINESS data only (people who asked to be contacted or subscribed).
-- Technical monitoring (errors, latency, request ids) stays in Vercel logs/observability and never lands here.
--
-- Access model: the website writes through a Vercel Function with the service-role key (server only).
-- Row Level Security is on and there are no policies, so `anon` / `authenticated` (and therefore the browser)
-- can neither read nor write anything.
--
-- Apply to a dedicated VBFA Supabase project after the client approves the privacy/consent text.

create table if not exists public.website_leads (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in ('membership', 'newsletter', 'contact')),
  name                 text,
  company              text,
  email                text not null check (char_length(email) <= 254 and position('@' in email) > 1),
  phone                text,
  interest             text,
  message              text check (message is null or char_length(message) <= 1000),
  consent              boolean not null check (consent = true),
  consent_text_version text not null,
  consent_at           timestamptz not null default now(),
  source_path          text not null default '/',
  utm                  jsonb not null default '{}'::jsonb,
  -- Salted HMAC of the visitor address, used only to rate-limit submissions. Cleared by purge_lead_metadata().
  ip_hash              text,
  status               text not null default 'new'
                         check (status in ('new', 'contacted', 'qualified', 'closed', 'unsubscribed', 'deleted')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint website_leads_name_required check (kind = 'newsletter' or char_length(coalesce(name, '')) > 0)
);

comment on table public.website_leads is 'Website inquiries and newsletter opt-ins. Business data only; written by the Vercel API with the service role.';
comment on column public.website_leads.ip_hash is 'Salted HMAC used for rate limiting only; nulled after the retention window.';

create index if not exists website_leads_created_idx on public.website_leads (created_at desc);
create index if not exists website_leads_email_idx   on public.website_leads (lower(email));
create index if not exists website_leads_rate_idx    on public.website_leads (ip_hash, created_at) where ip_hash is not null;
-- One newsletter subscription per address: a repeat submit is a harmless duplicate, not a second row.
create unique index if not exists website_leads_newsletter_email_uq on public.website_leads (lower(email)) where kind = 'newsletter';

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists website_leads_touch on public.website_leads;
create trigger website_leads_touch before update on public.website_leads
  for each row execute function public.touch_updated_at();

-- Deny by default.
alter table public.website_leads enable row level security;
revoke all on public.website_leads from anon, authenticated;

-- Retention: drop the rate-limiting fingerprint after a short window (default 30 days).
-- Schedule with pg_cron or Supabase Scheduled Functions, e.g. select public.purge_lead_metadata();
create or replace function public.purge_lead_metadata(retain interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update public.website_leads set ip_hash = null
   where ip_hash is not null and created_at < now() - retain;
  get diagnostics affected = row_count;
  return affected;
end $$;

revoke all on function public.purge_lead_metadata(interval) from public, anon, authenticated;
