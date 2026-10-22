-- VBFA metadata retention scheduler (Supabase Cron / pg_cron).
-- Daily at 03:17 UTC:
-- - clear hashed client fingerprints on leads older than 30 days;
-- - delete attempt counters older than 2 days.
-- NOTE: This does not delete full lead records; client-approved retention for
-- personal data must be defined separately before setting LEADS_ENABLED=true.
create extension if not exists pg_cron;
do $cronjob$
begin
 if not exists (select 1 from cron.job where jobname='vbfa-purge-lead-metadata') then
   perform cron.schedule('vbfa-purge-lead-metadata','17 3 * * *','select public.purge_lead_metadata()');
 end if;
end
$cronjob$;
