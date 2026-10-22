-- Hardening for an existing event-trigger helper in the new VBFA Supabase project.
-- It enables RLS on newly created tables as part of PostgreSQL DDL handling.
-- No public/authenticated role needs to invoke it directly through the Data API.
-- This is idempotent and does not disable the event trigger itself.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- Keep the postgres owner role and service management untouched.
