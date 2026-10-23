-- CRM Lead Inbox (Beta): staff allowlist, internal notes, audit trail and the RPCs the CRM calls.
--
-- Additive only: no existing table, column, constraint, policy or grant is changed and nothing is dropped.
--
-- Access model (same as website_leads): RLS is on, there are NO policies and anon / authenticated get NO privileges, so the
-- browser can never read or write these objects. The CRM is a server-rendered Vercel Function that verifies the Supabase Auth
-- session itself and then calls the SECURITY DEFINER functions below with the service-role key. Every function re-checks the
-- actor (an active crm_staff row bound to the verified Auth user id) and the actor's lead scope, so a bug in the Function
-- cannot widen access. The functions are executable by service_role only.
--
-- Roles are controlled by an administrator in crm_staff. They are NOT read from user-editable Auth metadata.
-- Audit rows hold ids, statuses and staff e-mails; never lead names, e-mails, phones or free text.

-- ───────────────────────── staff allowlist ─────────────────────────
create table if not exists public.crm_staff (
  email         text primary key check (email = lower(email) and char_length(email) <= 254 and position('@' in email) > 1),
  -- Supabase Auth user id, bound at the first successful sign-in. A different Auth user with the same e-mail is refused.
  user_id       uuid unique,
  role          text not null check (role in ('admin', 'staff')),
  -- Lead kinds this person may see and change ("agreed scope"). Admins are scoped the same way, they only add staff management.
  kinds         text[] not null default array['membership', 'newsletter', 'contact']
                  check (cardinality(kinds) > 0 and kinds <@ array['membership', 'newsletter', 'contact']),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text,
  last_login_at timestamptz
);
comment on table public.crm_staff is 'CRM allowlist: who may use the Lead Inbox, with which role and lead scope. Managed by admins; read only through service-role functions.';

-- ───────────────────────── internal notes ─────────────────────────
create table if not exists public.lead_notes (
  id           uuid primary key default gen_random_uuid(),
  -- Notes are personal data about the lead: they disappear with the lead (erasure request).
  lead_id      uuid not null references public.website_leads (id) on delete cascade,
  author_id    uuid not null,
  author_email text not null,
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at   timestamptz not null default now()
);
comment on table public.lead_notes is 'Internal CRM notes on a lead. Deleted with the lead.';
create index if not exists lead_notes_lead_idx on public.lead_notes (lead_id, created_at);

-- ───────────────────────── audit trail ─────────────────────────
create table if not exists public.crm_audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  actor_email text,
  action      text not null,
  -- No foreign key on purpose: the trail must survive the deletion of a lead (erasure request).
  lead_id     uuid,
  detail      jsonb not null default '{}'::jsonb
);
comment on table public.crm_audit_log is 'Who did what in the CRM. No lead personal data; kept by the retention decision recorded in docs/privacy/RETENTION_PROPOSAL.vi.md.';
create index if not exists crm_audit_log_at_idx   on public.crm_audit_log (at desc);
create index if not exists crm_audit_log_lead_idx on public.crm_audit_log (lead_id, at desc);

-- ───────────────────────── sign-in throttle ─────────────────────────
-- Same idea as form_attempts: salted HMACs only (of the visitor address and of the e-mail typed), never the values.
create table if not exists public.crm_login_attempts (
  id           bigint generated always as identity primary key,
  ip_hash      text not null,
  subject_hash text not null,
  created_at   timestamptz not null default now()
);
comment on table public.crm_login_attempts is 'CRM sign-in throttle: salted HMACs of the address and of the typed e-mail. Rows older than one day are removed on every attempt.';
create index if not exists crm_login_attempts_ip_idx      on public.crm_login_attempts (ip_hash, created_at);
create index if not exists crm_login_attempts_subject_idx on public.crm_login_attempts (subject_hash, created_at);

-- Deny by default.
alter table public.crm_staff          enable row level security;
alter table public.lead_notes         enable row level security;
alter table public.crm_audit_log      enable row level security;
alter table public.crm_login_attempts enable row level security;
revoke all on public.crm_staff, public.lead_notes, public.crm_audit_log, public.crm_login_attempts from anon, authenticated;

-- ───────────────────────── sign-in ─────────────────────────
-- Throttle: 'ok' | 'ip' (too many attempts from this address) | 'account' (too many for this e-mail). Counts every attempt.
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
  insert into public.crm_login_attempts (ip_hash, subject_hash) values (p_ip_hash, p_subject_hash);
  select count(*) into by_ip from public.crm_login_attempts where ip_hash = p_ip_hash and created_at > now() - p_window;
  if by_ip > p_max_ip then return 'ip'; end if;
  select count(*) into by_subject from public.crm_login_attempts where subject_hash = p_subject_hash and created_at > now() - p_window;
  if by_subject > p_max_subject then return 'account'; end if;
  return 'ok';
end $$;

-- Called once the Auth session was verified: binds the Auth user to the allowlist row on first use. No row = not allowed.
create or replace function public.crm_login(p_user_id uuid, p_email text)
returns table (email text, role text, kinds text[])
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me public.crm_staff;
  e  text := lower(btrim(coalesce(p_email, '')));
begin
  select * into me from public.crm_staff s where s.email = e for update;
  if not found or not me.active then
    return;
  end if;
  if me.user_id is not null and me.user_id <> p_user_id then
    insert into public.crm_audit_log (actor_id, actor_email, action, detail) values (p_user_id, e, 'login_denied', jsonb_build_object('reason', 'binding_mismatch'));
    return;
  end if;
  update public.crm_staff s set user_id = p_user_id, last_login_at = now() where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (p_user_id, e, 'login', jsonb_build_object('bound', me.user_id is null));
  return query select e, me.role, me.kinds;
end $$;

-- Per request: who is this verified Auth user in the CRM? No row = not staff (or deactivated).
create or replace function public.crm_whoami(p_user_id uuid)
returns table (email text, role text, kinds text[])
language sql stable security definer set search_path = '' as $$
  select s.email, s.role, s.kinds from public.crm_staff s where s.user_id = p_user_id and s.active
$$;

-- Events that are not tied to a staff row: a sign-out, or a valid Auth user that is not allowed in.
create or replace function public.crm_record_event(p_actor uuid, p_email text, p_action text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('logout', 'denied') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  insert into public.crm_audit_log (actor_id, actor_email, action) values (p_actor, left(lower(coalesce(p_email, '')), 254), p_action);
end $$;

-- ───────────────────────── Lead Inbox ─────────────────────────
-- List with filters. Statuses 'deleted' (pending erasure) are hidden unless asked for explicitly. The total is on every row.
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
  if p_status is not null and p_status not in ('new', 'contacted', 'qualified', 'closed', 'unsubscribed', 'deleted') then raise exception 'bad status' using errcode = '22023'; end if;
  if q is not null then
    pat := '%' || replace(replace(replace(left(q, 100), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
    select l.id, l.kind, l.name, l.company, l.email, l.status, l.source_path, l.consent_at, l.created_at,
           (select count(*) from public.lead_notes n where n.lead_id = l.id),
           count(*) over ()
      from public.website_leads l
     where l.kind = any (me.kinds)
       and (p_kind is null or l.kind = p_kind)
       and ((p_status is null and l.status <> 'deleted') or l.status = p_status)
       and (p_from is null or (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= p_from)
       and (p_to   is null or (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date <= p_to)
       and (pat is null or l.name ilike pat escape '\' or l.company ilike pat escape '\' or l.email ilike pat escape '\')
     order by l.created_at desc, l.id desc
     limit greatest(1, least(coalesce(p_limit, 25), 100))
    offset greatest(0, coalesce(p_offset, 0));
end $$;

-- One lead with its notes, or NULL when it does not exist, is erased, or is outside the actor's scope (same answer: no oracle).
-- Never returns ip_hash. Opening a lead is recorded in the audit trail.
create or replace function public.crm_get_lead(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me    public.crm_staff;
  lead  jsonb;
  notes jsonb;
begin
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;

  select to_jsonb(x) into lead from (
    select l.id, l.kind, l.name, l.company, l.email, l.phone, l.interest, l.message, l.consent, l.consent_text_version,
           l.consent_at, l.source_path, l.utm, l.status, l.created_at, l.updated_at
      from public.website_leads l
     where l.id = p_id and l.kind = any (me.kinds) and l.status <> 'deleted'
  ) x;
  if lead is null then return null; end if;

  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at, n.id), '[]'::jsonb) into notes
    from (select id, author_email, body, created_at from public.lead_notes where lead_id = p_id) n;

  insert into public.crm_audit_log (actor_id, actor_email, action, lead_id) values (me.user_id, me.email, 'lead_view', p_id);
  return jsonb_build_object('lead', lead, 'notes', notes);
end $$;

-- Status workflow: new -> contacted ("in progress") -> closed, in any direction between those three.
-- Optimistic concurrency: p_from must equal the current status, otherwise 'conflict' (someone else changed it first).
-- Returns 'ok' | 'noop' | 'conflict' | 'locked' | 'not_found'.
create or replace function public.crm_set_status(p_actor uuid, p_id uuid, p_from text, p_to text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me  public.crm_staff;
  cur text;
begin
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_to is null or p_to not in ('new', 'contacted', 'closed') then raise exception 'bad status' using errcode = '22023'; end if;

  select l.status into cur from public.website_leads l where l.id = p_id and l.kind = any (me.kinds) for update;
  if not found or cur = 'deleted' then return 'not_found'; end if;
  if cur = 'unsubscribed' then return 'locked'; end if;
  if cur is distinct from p_from then return 'conflict'; end if;
  if cur = p_to then return 'noop'; end if;

  update public.website_leads set status = p_to where id = p_id;
  insert into public.crm_audit_log (actor_id, actor_email, action, lead_id, detail)
    values (me.user_id, me.email, 'lead_status', p_id, jsonb_build_object('from', cur, 'to', p_to));
  return 'ok';
end $$;

-- Internal note with the author and time taken from the database, not from the caller. Returns 'ok' | 'not_found'.
create or replace function public.crm_add_note(p_actor uuid, p_id uuid, p_body text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me      public.crm_staff;
  note_id uuid;
begin
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'bad note' using errcode = '22023'; end if;

  if not exists (select 1 from public.website_leads l where l.id = p_id and l.kind = any (me.kinds) and l.status <> 'deleted') then
    return 'not_found';
  end if;
  insert into public.lead_notes (lead_id, author_id, author_email, body) values (p_id, me.user_id, me.email, btrim(p_body)) returning id into note_id;
  insert into public.crm_audit_log (actor_id, actor_email, action, lead_id, detail)
    values (me.user_id, me.email, 'lead_note', p_id, jsonb_build_object('note_id', note_id));
  return 'ok';
end $$;

-- ───────────────────────── staff management (admin only) ─────────────────────────
create or replace function public.crm_staff_list(p_actor uuid)
returns table (email text, role text, kinds text[], active boolean, bound boolean, last_login_at timestamptz, created_at timestamptz, created_by text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me public.crm_staff;
begin
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found or me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.email, s.role, s.kinds, s.active, s.user_id is not null, s.last_login_at, s.created_at, s.created_by
      from public.crm_staff s order by s.created_at, s.email;
end $$;

-- Adds a person to the allowlist (the Auth user itself is created in the Supabase dashboard: invitation only) or changes
-- role / scope. p_reset_binding forgets the bound Auth user (use it after an Auth user was deleted and created again).
-- Returns 'created' | 'updated' | 'last_admin'.
create or replace function public.crm_staff_upsert(p_actor uuid, p_email text, p_role text, p_kinds text[], p_reset_binding boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me       public.crm_staff;
  e        text := lower(btrim(coalesce(p_email, '')));
  existing public.crm_staff;
  admins   integer;
begin
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
    select count(*) into admins from public.crm_staff s where s.role = 'admin' and s.active and s.email <> e;
    if admins = 0 then return 'last_admin'; end if;
  end if;
  update public.crm_staff s
     set role = p_role, kinds = p_kinds, user_id = case when coalesce(p_reset_binding, false) then null else s.user_id end
   where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (me.user_id, me.email, 'staff_upsert', jsonb_build_object('target', e, 'role', p_role, 'created', false, 'reset_binding', coalesce(p_reset_binding, false)));
  return 'updated';
end $$;

-- Returns 'ok' | 'not_found' | 'last_admin' (the last active admin cannot be deactivated).
create or replace function public.crm_staff_set_active(p_actor uuid, p_email text, p_active boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  me     public.crm_staff;
  e      text := lower(btrim(coalesce(p_email, '')));
  target public.crm_staff;
  admins integer;
begin
  select * into me from public.crm_staff s where s.user_id = p_actor and s.active;
  if not found or me.role <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_active is null then raise exception 'bad state' using errcode = '22023'; end if;

  select * into target from public.crm_staff s where s.email = e for update;
  if not found then return 'not_found'; end if;
  if not p_active and target.role = 'admin' and target.active then
    select count(*) into admins from public.crm_staff s where s.role = 'admin' and s.active and s.email <> e;
    if admins = 0 then return 'last_admin'; end if;
  end if;
  update public.crm_staff s set active = p_active where s.email = e;
  insert into public.crm_audit_log (actor_id, actor_email, action, detail)
    values (me.user_id, me.email, 'staff_active', jsonb_build_object('target', e, 'active', p_active));
  return 'ok';
end $$;

-- Only the Vercel Function (service role) may call these; the browser roles and PUBLIC may not.
revoke all on function public.crm_login_throttle(text, text, interval, integer, integer)           from public, anon, authenticated;
revoke all on function public.crm_login(uuid, text)                                                 from public, anon, authenticated;
revoke all on function public.crm_whoami(uuid)                                                      from public, anon, authenticated;
revoke all on function public.crm_record_event(uuid, text, text)                                    from public, anon, authenticated;
revoke all on function public.crm_list_leads(uuid, text, text, date, date, text, integer, integer)  from public, anon, authenticated;
revoke all on function public.crm_get_lead(uuid, uuid)                                              from public, anon, authenticated;
revoke all on function public.crm_set_status(uuid, uuid, text, text)                                from public, anon, authenticated;
revoke all on function public.crm_add_note(uuid, uuid, text)                                        from public, anon, authenticated;
revoke all on function public.crm_staff_list(uuid)                                                  from public, anon, authenticated;
revoke all on function public.crm_staff_upsert(uuid, text, text, text[], boolean)                   from public, anon, authenticated;
revoke all on function public.crm_staff_set_active(uuid, text, boolean)                             from public, anon, authenticated;

grant execute on function public.crm_login_throttle(text, text, interval, integer, integer)          to service_role;
grant execute on function public.crm_login(uuid, text)                                                to service_role;
grant execute on function public.crm_whoami(uuid)                                                     to service_role;
grant execute on function public.crm_record_event(uuid, text, text)                                   to service_role;
grant execute on function public.crm_list_leads(uuid, text, text, date, date, text, integer, integer) to service_role;
grant execute on function public.crm_get_lead(uuid, uuid)                                             to service_role;
grant execute on function public.crm_set_status(uuid, uuid, text, text)                               to service_role;
grant execute on function public.crm_add_note(uuid, uuid, text)                                       to service_role;
grant execute on function public.crm_staff_list(uuid)                                                 to service_role;
grant execute on function public.crm_staff_upsert(uuid, text, text, text[], boolean)                  to service_role;
grant execute on function public.crm_staff_set_active(uuid, text, boolean)                            to service_role;
