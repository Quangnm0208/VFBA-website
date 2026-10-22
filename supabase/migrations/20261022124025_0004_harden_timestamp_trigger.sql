-- The function is a trigger helper; it only calls pg_catalog.now().
-- Pin resolution of SQL objects to the trusted system schema.
alter function public.touch_updated_at() set search_path = pg_catalog;
-- Direct invocation by site users is unnecessary: updates call it as a trigger.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
