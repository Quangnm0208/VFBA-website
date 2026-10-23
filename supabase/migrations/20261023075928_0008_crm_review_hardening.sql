-- CRM hardening after an independent review of 0007. Only the CRM's own objects are replaced; nothing is dropped.
--
-- 1. Sign-in throttle: refused attempts are no longer stored (a flood cannot keep a lock alive or grow the table), and the
--    clean-up of old rows is served by an index on created_at. The Function now keys the per-account bucket on
--    (e-mail, visitor address), so a stranger cannot lock a real person out from another address.
-- 2. Staff management: the "last administrator" rule is evaluated under an advisory lock (two concurrent requests can no longer
--    both pass it) and counts only administrators who have signed in at least once (a row that cannot log in yet is not an administrator you can rely on).
-- 3. Lead list: pending-erasure leads (status 'deleted') can no longer be requested through the function at all, so the database
--    enforces what the CRM screens already assume.

create index if not exists crm_login_attempts_created_idx on public.crm_login_attempts (created_at);

create or replace function public.crm_login_throttle(
  p_ip_hash      text,
  p_subject_hash text,
  p_window       interval default interval '10 minutes',
  p_max_ip       integer  default 20,
  p_max_subject  integer  default 8
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  by_ip      integer;
  by_subject integer;
begin
  delete from public.crm_login_attempts where created_at < now() - interval '1 day';
  select count(*) into by_ip from public.crm_login_attempts where ip_hash = p_ip_hash and created_at > now() - p_window;
  if by_ip >= p_max_ip then return 'ip'; end if;
  select count(*) into by_subject from public.crm_login_attempts where subject_hash = p_subject_hash and created_at > now() - p_window;
  if by_subject >= p_max_subject then return 'account'; end if;
  insert into public.crm_login_attempts (ip_hash, subject_hash) values (p_ip_hash, p_subject_hash);
  return 'ok';
end $$;

create or replace function public.crm_list_leads(
  p_actor  uuid,
  p_kind   text    default null,
  p_status text    default null,
  p_from   date    default null,
  p_to     date    default null,
  p_q      text    default null,
  p_limit  integer default 25,
  p_offset integer default 0
) returns table (
  id uuid, kind text, name text, company text, email text, status text, source_path text,
  consent_at timestamptz, created_at timestamptz, notes bigint, total bigint
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me  public.crm_staff;
  q   text := nullif(btrim(coalesce(p_q, '')), '');
  pat text;
begin
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind   is not null and p_kind   not in ('membership', 'newsletter', 'contact') then raise exception 'bad kind'   using errcode = '22023'; end if;
  -- 'deleted' (pending erasure) is deliberately not an accepted filter.
  if p_status is not null and p_status not in ('new', 'contacted', 'qualified', 'closed', 'unsubscribed') then raise exception 'bad status' using errcode = '22023'; end if;
  if q is not null then
    pat := '%' || replace(replace(replace(left(q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select l.id, l.kind, l.name, l.company, l.email, l.status, l.source_path, l.consent_at, l.created_at,
           (select count(*) from public.lead_notes n where n.lead_id = l.id),
           count(*) over ()
      from public.website_leads l
     where l.kind = any (me.kinds)
       and l.status <> 'deleted'
       and (p_kind is null or l.kind = p_kind)
       and (p_status is null or l.status = p_status)
       and (p_from is null or (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
       and (p_to   is null or (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
       and (pat is null or l.name ilike pat escape '\' or l.company ilike pat escape '\' or l.email ilike pat escape '\')
     order by l.created_at desc, l.id desc
     limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

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
     set role = p_role, kinds = p_kinds, user_id = case when coalesce(p_reset_binding, false) then null else s.user_id end
   where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (me.user_id, me.email, 'staff_upsert', jsonb_build_object('target', e, 'role', p_role, 'created', false, 'reset_binding', coalesce(p_reset_binding, false)));
  return 'updated';
end $$;

create or replace function public.crm_staff_set_active(p_actor uuid, p_email text, p_active boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me     public.crm_staff;
  e      text := lower(btrim(coalesce(p_email, '')));
  target public.crm_staff;
  admins integer;
begin
  perform pg_advisory_xact_lock(hashtext('vbfa.crm_staff'));
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found or me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_active is null then raise exception 'bad state' using errcode = '22023'; end if;

  select * into target from public.crm_staff s where s.email = e for update;
  if not found then return 'not_found'; end if;
  if not p_active and target.role = 'admin' and target.active then
    select count(*) into admins from public.crm_staff s where s.role = 'admin' and s.active and s.user_id is not null and s.email <> e;
    if admins = 0 then return 'last_admin'; end if;
  end if;
  update public.crm_staff s set active = p_active where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (me.user_id, me.email, 'staff_active', jsonb_build_object('target', e, 'active', p_active));
  return 'ok';
end $$;

-- Same ACLs as 0007 (create or replace keeps them; stated again so this file is self-contained).
revoke all on function public.crm_login_throttle(text, text, interval, integer, integer)           from public, anon, authenticated;
revoke all on function public.crm_list_leads(uuid, text, text, date, date, text, integer, integer)  from public, anon, authenticated;
revoke all on function public.crm_staff_upsert(uuid, text, text, text[], boolean)                   from public, anon, authenticated;
revoke all on function public.crm_staff_set_active(uuid, text, boolean)                             from public, anon, authenticated;
grant execute on function public.crm_login_throttle(text, text, interval, integer, integer)          to service_role;
grant execute on function public.crm_list_leads(uuid, text, text, date, date, text, integer, integer) to service_role;
grant execute on function public.crm_staff_upsert(uuid, text, text, text[], boolean)                  to service_role;
grant execute on function public.crm_staff_set_active(uuid, text, boolean)                            to service_role;
