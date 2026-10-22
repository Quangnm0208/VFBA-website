-- Abuse protection for the website forms (membership + newsletter).
--
-- 0001 limited submissions by counting STORED leads per visitor. That ignores everything that does not end in a row:
-- repeated newsletter addresses (answered as a duplicate), failed captchas, database errors. This migration counts every
-- attempt that reached the server and passed shape validation, whether or not it was stored.
--
-- Data boundary: the counter holds a salted HMAC of the visitor address and the form kind. No name, email or address.
-- Rows are deleted after two days by purge_lead_metadata().

create table if not exists public.form_attempts (
  id         bigint generated always as identity primary key,
  -- Salted HMAC of the visitor address (a fixed bucket when the address is unknown). Never the address itself.
  ip_hash    text not null,
  kind       text not null check (kind in ('membership', 'newsletter')),
  created_at timestamptz not null default now()
);

comment on table public.form_attempts is 'Rate-limit counter: salted HMAC of the visitor address + form kind. Business-neutral, no personal data; purged after two days.';

create index if not exists form_attempts_rate_idx on public.form_attempts (ip_hash, created_at);

-- Deny by default, like website_leads: only the service role (the Vercel Function) can touch it.
alter table public.form_attempts enable row level security;
revoke all on public.form_attempts from anon, authenticated;

-- One round trip: record the attempt, then decide.
--   'attempts' -> too many requests from this address in the window (successful or not)
--   'leads'    -> too many leads already stored from this address in the window
--   'ok'       -> proceed
-- The attempt just recorded is included in the count, so p_max_attempts = 15 allows fifteen and refuses the sixteenth.
create or replace function public.register_attempt(
  p_ip_hash      text,
  p_kind         text,
  p_window       interval default interval '10 minutes',
  p_max_attempts integer  default 15,
  p_max_leads    integer  default 5
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  attempts integer;
  leads    integer;
begin
  insert into public.form_attempts (ip_hash, kind) values (p_ip_hash, p_kind);

  select count(*) into attempts from public.form_attempts
   where ip_hash = p_ip_hash and created_at > now() - p_window;
  if attempts > p_max_attempts then
    return 'attempts';
  end if;

  select count(*) into leads from public.website_leads
   where ip_hash = p_ip_hash and created_at > now() - p_window;
  if leads >= p_max_leads then
    return 'leads';
  end if;

  return 'ok';
end $$;

revoke all on function public.register_attempt(text, text, interval, integer, integer) from public, anon, authenticated;
grant execute on function public.register_attempt(text, text, interval, integer, integer) to service_role;

-- Retention for rate-limit metadata: address hashes on stored leads are cleared after `retain` (default 30 days) and the
-- attempt counter is emptied after two days. Returns the number of rows changed.
create or replace function public.purge_lead_metadata(retain interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cleared integer;
  removed integer;
begin
  update public.website_leads set ip_hash = null
   where ip_hash is not null and created_at < now() - retain;
  get diagnostics cleared = row_count;

  delete from public.form_attempts where created_at < now() - interval '2 days';
  get diagnostics removed = row_count;

  return cleared + removed;
end $$;

revoke all on function public.purge_lead_metadata(interval) from public, anon, authenticated;

-- Daily purge at 03:17 UTC when the pg_cron extension is enabled (Supabase: Database -> Extensions -> pg_cron).
-- Without pg_cron this block does nothing: schedule `select public.purge_lead_metadata();` another way (see
-- docs/OPERATIONS.md). Idempotent: an existing job of the same name is replaced.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'vbfa-purge-lead-metadata';
    perform cron.schedule('vbfa-purge-lead-metadata', '17 3 * * *', 'select public.purge_lead_metadata()');
  end if;
end
$cron$;
