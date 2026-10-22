-- Schema fingerprint of the `public` schema: columns, constraints, indexes, triggers, function bodies (md5), SECURITY DEFINER
-- flags, search_path settings, function ACLs and RLS flags. Run it on the live project (SQL editor / MCP) and on a database
-- built from supabase/migrations (scripts/qa/db-fingerprint.mjs); the two hashes must be identical.
-- `contype <> 'n'` skips the NOT NULL constraint rows that newer Postgres versions list in pg_constraint.
select count(*) as rows, md5(string_agg(k||'|'||n||'|'||v, E'\n' order by k collate "C", n collate "C")) as fingerprint from (
select k, n, v from (
 select 'col' k, table_name||'.'||column_name n, data_type||' | '||coalesce(column_default,'')||' | '||is_nullable v from information_schema.columns where table_schema='public'
 union all select 'con', conrelid::regclass::text||'.'||conname, pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace and contype <> 'n'
 union all select 'idx', tablename||'.'||indexname, indexdef from pg_indexes where schemaname='public'
 union all select 'trg', c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal
 union all select 'fn', p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(pg_get_functiondef(p.oid))||' secdef='||p.prosecdef::text||' cfg='||coalesce(p.proconfig::text,'')||' acl='||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace and p.proname<>'rls_auto_enable'
 union all select 'rls', relname, relrowsecurity::text||' force='||relforcerowsecurity::text from pg_class where relnamespace='public'::regnamespace and relkind='r'
) s order by 1,2
) t;
