-- CRM Admin Portal, fixes from the independent review of 0009 (docs/evidence/ADMIN_PORTAL_2026-10-23.md, section 4).
--
-- Additive in effect: one index and CREATE OR REPLACE of existing functions (same signatures and grants) plus one new function.
-- No table, column or policy is dropped or changed, nothing is granted to anon / authenticated.
--
--  1. Audit flood: every Admin Portal tool mount wrote a `login` row, and every call of a Sanity project member who is not on the
--     allowlist wrote a `denied` row. A repeated sign-in within 15 minutes now writes nothing, and a repeated denial for the same
--     e-mail and reason is recorded once per hour. The audit trail has no purge; it must stay readable.
--  2. Rollback to the website's own sign-in (/admin/): a person whose FIRST sign-in was through the portal carries a placeholder
--     actor id derived from the Sanity id (md5 of 'vbfa-portal:' || sanity id). crm_login refused them as a binding mismatch. The
--     placeholder is never a real Supabase Auth id, so crm_login now replaces it with the real one.
--  3. Last administrator: resetting the binding of the only bound active administrator left no usable administrator. It is refused
--     (`last_admin`). A new function resets ONLY the binding (no stale role / scope sent from a screen) and refuses to reset oneself.
--  4. E-mail addresses reaching the portal functions must be printable ASCII: Unicode case folding in a client could make two
--     different strings equal (for example the Kelvin sign and "k").

create index if not exists crm_audit_log_actor_idx on public.crm_audit_log (actor_email, at desc);

-- ───────────────────────── 1 + 4: portal sign-in ─────────────────────────
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
  -- The pattern is applied to the address as received: lower() runs first only for the lookup (a Unicode letter can fold into ASCII).
  if sid = '' or char_length(sid) > 128 or e = '' or btrim(coalesce(p_email, '')) !~ '^[!-~]+$' then
    return;
  end if;
  select * into me from public.crm_staff s where s.email = e for update;
  if not found or not me.active then
    return;
  end if;
  if me.sanity_user_id is not null and me.sanity_user_id <> sid then
    if not exists (select 1 from public.crm_audit_log l where l.action = 'login_denied' and l.actor_email = e
                      and l.detail ->> 'reason' = 'binding_mismatch' and l.at > now() - interval '1 hour') then
      insert into public.crm_audit_log (actor_id, actor_email, action, detail)
        values (me.user_id, e, 'login_denied', jsonb_build_object('reason', 'binding_mismatch', 'provider', 'sanity'));
    end if;
    return;
  end if;
  -- Another allowlist row already carries this Sanity id (an e-mail changed at the provider): refuse, never merge two rows.
  if me.sanity_user_id is null and exists (select 1 from public.crm_staff s where s.sanity_user_id = sid and s.email <> e) then
    if not exists (select 1 from public.crm_audit_log l where l.action = 'login_denied' and l.actor_email = e
                      and l.detail ->> 'reason' = 'sanity_id_in_use' and l.at > now() - interval '1 hour') then
      insert into public.crm_audit_log (actor_id, actor_email, action, detail)
        values (me.user_id, e, 'login_denied', jsonb_build_object('reason', 'sanity_id_in_use', 'provider', 'sanity'));
    end if;
    return;
  end if;
  -- Signed in a moment ago with the same identity: nothing to bind, nothing to record (a Studio tool calls this on every mount).
  if me.sanity_user_id = sid and me.user_id is not null and me.last_login_at is not null and me.last_login_at > now() - interval '15 minutes' then
    return query select me.user_id, e, me.role, me.kinds;
    return;
  end if;
  a := coalesce(me.user_id, md5('vbfa-portal:' || sid)::uuid);
  update public.crm_staff s set sanity_user_id = sid, user_id = a, last_login_at = now() where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (a, e, 'login', jsonb_build_object('provider', 'sanity', 'bound', me.sanity_user_id is null));
  return query select a, e, me.role, me.kinds;
end $$;

create or replace function public.crm_portal_whoami(p_sanity_id text, p_email text)
returns table (actor uuid, email text, role text, kinds text[])
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.email, s.role, s.kinds
    from public.crm_staff s
   where s.sanity_user_id = btrim(coalesce(p_sanity_id, ''))
     and s.email = lower(btrim(coalesce(p_email, '')))
     and btrim(coalesce(p_email, '')) ~ '^[!-~]+$'
     and s.active
     and s.user_id is not null
$$;

create or replace function public.crm_portal_denied(p_sanity_id text, p_email text, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := left(lower(btrim(coalesce(p_email, ''))), 254);
  r text := left(coalesce(p_reason, 'not_staff'), 40);
begin
  -- Anyone who is a member of the Sanity project can reach this: one entry per e-mail, reason and hour is enough evidence.
  if exists (select 1 from public.crm_audit_log l where l.action = 'denied' and l.actor_email = e
                and l.detail ->> 'reason' = r and l.at > now() - interval '1 hour') then
    return;
  end if;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (md5('vbfa-portal:' || btrim(coalesce(p_sanity_id, '')))::uuid, e, 'denied', jsonb_build_object('provider', 'sanity', 'reason', r));
end $$;

-- ───────────────────────── 2: the website's own sign-in accepts a portal placeholder ─────────────────────────
create or replace function public.crm_login(p_user_id uuid, p_email text)
returns table (email text, role text, kinds text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me          public.crm_staff;
  e           text := lower(btrim(coalesce(p_email, '')));
  placeholder boolean;
begin
  select * into me from public.crm_staff s where s.email = e for update;
  if not found or not me.active then
    return;
  end if;
  -- The actor id given by a portal-first sign-in is derived from the Sanity id, never a real Auth id: the real one replaces it.
  placeholder := me.sanity_user_id is not null and me.user_id = md5('vbfa-portal:' || me.sanity_user_id)::uuid;
  if me.user_id is not null and me.user_id <> p_user_id and not placeholder then
    insert into public.crm_audit_log (actor_id, actor_email, action, detail) values (p_user_id, e, 'login_denied', jsonb_build_object('reason', 'binding_mismatch'));
    return;
  end if;
  update public.crm_staff s set user_id = p_user_id, last_login_at = now() where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (p_user_id, e, 'login', jsonb_build_object('bound', me.user_id is null, 'replaced_portal_id', placeholder));
  return query select e, me.role, me.kinds;
end $$;

-- ───────────────────────── 3: last administrator ─────────────────────────
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
  -- Forgetting the binding of the only bound administrator would leave nobody able to sign in as an administrator.
  if coalesce(p_reset_binding, false) and existing.role = 'admin' and existing.active and existing.user_id is not null then
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

-- Only the binding, nothing else: a screen that loaded the list a minute ago cannot undo somebody else's role or scope change.
-- 'ok' | 'not_found' | 'self' (resetting your own binding ends your own session, ask another administrator).
create or replace function public.crm_staff_reset_binding(p_actor uuid, p_email text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me       public.crm_staff;
  e        text := lower(btrim(coalesce(p_email, '')));
  existing public.crm_staff;
begin
  perform pg_advisory_xact_lock(hashtext('vbfa.crm_staff'));
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found or me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into existing from public.crm_staff s where s.email = e for update;
  if not found then return 'not_found'; end if;
  if existing.email = me.email then return 'self'; end if;
  -- The actor is a bound, active administrator other than the target, so at least one usable administrator remains.
  update public.crm_staff s set user_id = null, sanity_user_id = null where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (me.user_id, me.email, 'staff_reset', jsonb_build_object('target', e));
  return 'ok';
end $$;

revoke all on function public.crm_portal_login(text, text)                          from public, anon, authenticated;
revoke all on function public.crm_portal_whoami(text, text)                         from public, anon, authenticated;
revoke all on function public.crm_portal_denied(text, text, text)                   from public, anon, authenticated;
revoke all on function public.crm_login(uuid, text)                                 from public, anon, authenticated;
revoke all on function public.crm_staff_upsert(uuid, text, text, text[], boolean)   from public, anon, authenticated;
revoke all on function public.crm_staff_reset_binding(uuid, text)                   from public, anon, authenticated;
grant execute on function public.crm_portal_login(text, text)                       to service_role;
grant execute on function public.crm_portal_whoami(text, text)                      to service_role;
grant execute on function public.crm_portal_denied(text, text, text)                to service_role;
grant execute on function public.crm_login(uuid, text)                              to service_role;
grant execute on function public.crm_staff_upsert(uuid, text, text, text[], boolean) to service_role;
grant execute on function public.crm_staff_reset_binding(uuid, text)                to service_role;
