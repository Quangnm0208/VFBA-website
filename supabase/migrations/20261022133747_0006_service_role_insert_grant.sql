-- Make the Vercel Function's table privilege explicit instead of relying on the project's default privileges.
--
-- The Function only ever INSERTs into website_leads (supabase-js `.insert()` with no `.select()`); everything else goes
-- through the SECURITY DEFINER function register_attempt. Supabase already grants service_role ALL on new tables, so this
-- changes nothing today; it keeps the form working if the project's default privileges are ever tightened.
-- Applying it again is harmless.
grant insert on public.website_leads to service_role;
