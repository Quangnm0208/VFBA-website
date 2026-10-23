-- CRM Admin Portal identity (Beta): a second, equally strict way to prove who is calling the CRM functions.
--
-- Additive only: one nullable column and one partial unique index on crm_staff, three new functions, and a replacement of
-- crm_staff_upsert that ALSO clears the new binding when an administrator resets a person's binding. Nothing is dropped, no
-- grant to anon / authenticated, RLS and the lack of policies are unchanged.
--
-- Background: the Admin Portal is a Sanity Studio on its own Vercel project. A person signs in once, with Sanity. The portal's
-- server (never the browser) asks Sanity "who owns this session token?" and receives a Sanity user id and the verified e-mail.
-- It then calls these functions with the service-role key. The allowlist stays the authority: Sanity proves WHO somebody is,
-- crm_staff (managed by administrators, not by user-editable metadata) says WHAT they may do.
--
-- The actor id every other crm_* function checks is crm_staff.user_id. A person who already signed in through the website's
-- own CRM sign-in keeps that id; a person who only ever uses the portal gets a stable id derived from the Sanity user id, so
-- no existing function changes and the "last administrator" rules keep counting them.

alter table public.crm_staff add column if not exists sanity_user_id text
  check (sanity_user_id is null or char_length(sanity_user_id) between 1 and 128);
comment on column public.crm_staff.sanity_user_id is 'Sanity user id bound at the first Admin Portal sign-in. A different Sanity user with the same e-mail is refused until an administrator resets the binding.';
create unique index if not exists crm_staff_sanity_user_id_key on public.crm_staff (sanity_user_id) where sanity_user_id is not null;

-- First portal sign-in of the session: binds the verified Sanity identity to the allowlist row (by e-mail) and returns the actor.
create or replace function public.crm_portal_login(p_sanity_id text, p_email text)
returns table (actor uuid, email text, role text, kinds text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me   public.crm_staff;
  e    text := lower(btrim(coalesce(p_email, '')));
  sid  text := btrim(coalesce(p_sanity_id, ''));
  a    uuid;
begin
  if sid = '' or char_length(sid) > 128 or e = '' then
    return;
  end if;
  select * into me from public.crm_staff s where s.email = e for update;
  if not found or not me.active then
    return;
  end if;
  if me.sanity_user_id is not null and me.sanity_user_id <> sid then
    insert into public.crm_audit_log (actor_id, actor_email, action, detail)
      values (me.user_id, e, 'login_denied', jsonb_build_object('reason', 'binding_mismatch', 'provider', 'sanity'));
    return;
  end if;
  -- Another allowlist row already carries this Sanity id (an e-mail changed at the provider): refuse, never merge two rows.
  if me.sanity_user_id is null and exists (select 1 from public.crm_staff s where s.sanity_user_id = sid and s.email <> e) then
    insert into public.crm_audit_log (actor_id, actor_email, action, detail)
      values (me.user_id, e, 'login_denied', jsonb_build_object('reason', 'sanity_id_in_use', 'provider', 'sanity'));
    return;
  end if;
  a := coalesce(me.user_id, md5('vbfa-portal:' || sid)::uuid);
  update public.crm_staff s set sanity_user_id = sid, user_id = a, last_login_at = now() where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (a, e, 'login', jsonb_build_object('provider', 'sanity', 'bound', me.sanity_user_id is null));
  return query select a, e, me.role, me.kinds;
end $$;

-- Per request: is this verified Sanity identity an active, already bound staff member? Read-only (no audit row per request).
create or replace function public.crm_portal_whoami(p_sanity_id text, p_email text)
returns table (actor uuid, email text, role text, kinds text[])
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.email, s.role, s.kinds
    from public.crm_staff s
   where s.sanity_user_id = btrim(coalesce(p_sanity_id, ''))
     and s.email = lower(btrim(coalesce(p_email, '')))
     and s.active
     and s.user_id is not null
$$;

-- An identity that Sanity vouches for but that is not allowed in: a trail entry without personal data beyond the staff-style e-mail.
create or replace function public.crm_portal_denied(p_sanity_id text, p_email text, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (md5('vbfa-portal:' || btrim(coalesce(p_sanity_id, '')))::uuid, left(lower(coalesce(p_email, '')), 254), 'denied',
            jsonb_build_object('provider', 'sanity', 'reason', left(coalesce(p_reason, 'not_staff'), 40)));
end $$;

-- Same function as migration 0008, plus: resetting a binding also forgets the Sanity binding.
create or replace function public.crm_staff_upsert(p_actor uuid, p_email text, p_role text, p_kinds text[], p_reset_binding boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me       public.crm_staff;
  e        text := lower(btrim(coalesce(p_email, '')));
  existing public.crm_staff;
  admins   integer;
begin
  perform pg_advisory_xact_lock(hashtext('vbfa.crm_staff'));
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found or me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(e) > 254 or position('@' in e) < 2 then raise exception 'bad email' using errcode = '22023'; end if;
  if p_role not in ('admin', 'staff') then raise exception 'bad role' using errcode = '22023'; end if;
  if p_kinds is null or cardinality(p_kinds) = 0 or not (p_kinds <@ array['membership', 'newsletter', 'contact']) then raise exception 'bad scope' using errcode = '22023'; end if;

  select * into existing from public.crm_staff s where s.email = e for update;
  if not found then
    insert into public.crm_staff (email, role, kinds, created_by) values (e, p_role, p_kinds, me.email);
    insert into public.crm_audit_log (actor_id, actor_email, action, detail)
      values (me.user_id, me.email, 'staff_upsert', jsonb_build_object('target', e, 'role', p_role, 'created', true));
    return 'created';
  end if;

  if existing.role = 'admin' and existing.active and p_role <> 'admin' then
    select count(*) into admins from public.crm_staff s where s.role = 'admin' and s.active and s.user_id is not null and s.email <> e;
    if admins = 0 then return 'last_admin'; end if;
  end if;
  update public.crm_staff s
     set role = p_role, kinds = p_kinds,
         user_id = case when coalesce(p_reset_binding, false) then null else s.user_id end,
         sanity_user_id = case when coalesce(p_reset_binding, false) then null else s.sanity_user_id end
   where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (me.user_id, me.email, 'staff_upsert', jsonb_build_object('target', e, 'role', p_role, 'created', false, 'reset_binding', coalesce(p_reset_binding, false)));
  return 'updated';
end $$;

revoke all on function public.crm_portal_login(text, text)                  from public, anon, authenticated;
revoke all on function public.crm_portal_whoami(text, text)                 from public, anon, authenticated;
revoke all on function public.crm_portal_denied(text, text, text)           from public, anon, authenticated;
revoke all on function public.crm_staff_upsert(uuid, text, text, text[], boolean) from public, anon, authenticated;
grant execute on function public.crm_portal_login(text, text)               to service_role;
grant execute on function public.crm_portal_whoami(text, text)              to service_role;
grant execute on function public.crm_portal_denied(text, text, text)        to service_role;
grant execute on function public.crm_staff_upsert(uuid, text, text, text[], boolean) to service_role;
