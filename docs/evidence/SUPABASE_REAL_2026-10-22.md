# Evidence: the real VBFA Supabase project (2026-10-22)

Everything below was observed on the dedicated project **`bzrtllytykldnawbuszu`** (name `VBFA`, Postgres 17.11, region
`ap-northeast-2` / Seoul) through the authenticated Supabase connector, and is labelled **REAL** only when it ran against
that database. Nothing here involves another application's database. Time of the observations: 13:00-13:45 UTC.

## 1. Migration history: repository vs project

The project's history uses the versions below. The repository files carry the same version as a prefix so the Supabase CLI
(`supabase migration list`, `supabase db push`) sees one history, not two; the ordinal stays in the name.

| Remote version | Remote name | Repository file | Applied by |
|---|---|---|---|
| 20261022123647 | 0001_website_leads | `supabase/migrations/20261022123647_0001_website_leads.sql` | activation stream |
| 20261022123654 | 0002_form_throttle | `..._0002_form_throttle.sql` | activation stream |
| 20261022123815 | 0003_revoke_rls_trigger_access | `..._0003_revoke_rls_trigger_access.sql` | activation stream |
| 20261022124025 | 0004_harden_timestamp_trigger | `..._0004_harden_timestamp_trigger.sql` | activation stream |
| 20261022124107 | 0005_schedule_metadata_purge | `..._0005_schedule_metadata_purge.sql` | activation stream |
| 20261022133747 | 0006_service_role_insert_grant | `..._0006_service_role_insert_grant.sql` | this work (idempotent grant; no data touched) |

Nothing was re-run blindly: 0001-0005 were only inspected. 0006 was applied once; it only makes an existing privilege explicit.

## 2. REAL: the live schema is exactly what the repository's migrations produce

`supabase/fingerprint.sql` hashes the `public` schema (columns with types and defaults, constraints, indexes, trigger,
function bodies, SECURITY DEFINER flags, `search_path` settings, function ACLs, RLS flags: 43 rows).

| Where | Result |
|---|---|
| Live project (SQL run through the connector) | `rows = 43`, `fingerprint = 95bf69af89bfa4e96e9a78f4f78def2f` |
| Fresh database built from `supabase/migrations` (`node scripts/qa/db-fingerprint.mjs`) | `rows = 43`, `fingerprint = 95bf69af89bfa4e96e9a78f4f78def2f` |

Reproduce: run `supabase/fingerprint.sql` in the project's SQL editor and compare with the script's output. The cron job
(migration 0005) needs the `pg_cron` extension, which the local database does not have, so it is checked on the project (section 5).

## 3. REAL: privileges and Row Level Security

| Role | INSERT website_leads | SELECT website_leads | INSERT form_attempts | EXECUTE register_attempt | EXECUTE purge_lead_metadata |
|---|---|---|---|---|---|
| anon | no | no | no | no | no |
| authenticated | no | no | no | no | no |
| service_role | yes | yes | yes | yes | yes |

- Both tables have RLS enabled and **no policies** (intentional: the browser must never read or write leads).
- `SET ROLE anon; select count(*) from website_leads` -> `42501 permission denied for table website_leads`.
- `SET ROLE authenticated; select register_attempt(...)` -> `42501 permission denied for function register_attempt`.
- `rls_auto_enable()` and `touch_updated_at()` are executable by `postgres` and `service_role` only; `touch_updated_at()` has `search_path = pg_catalog`.
- The project's event trigger `ensure_rls` still works after the revocation: a table created inside a rolled-back transaction came out with RLS enabled.

**Not done: an HTTP probe of the Data API with the public anon key** (`GET /rest/v1/website_leads`, `POST /rest/v1/rpc/register_attempt`).
The engineering sandbox cannot reach `*.supabase.co` (its network policy denies the host), so the privilege checks above were
made inside Postgres. Run the probe from any machine; each call must answer 401/403 or `permission denied`:

```bash
K=<the project's anon/publishable key>; U=https://bzrtllytykldnawbuszu.supabase.co/rest/v1
curl -s -H "apikey: $K" -H "Authorization: Bearer $K" "$U/website_leads?select=id&limit=1"
curl -s -X POST -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"p_ip_hash":"x","p_kind":"newsletter"}' "$U/rpc/register_attempt"
curl -s -X POST -H "apikey: $K" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -d '{"kind":"newsletter","email":"anon-probe@example.invalid","consent":true,"consent_text_version":"probe"}' "$U/website_leads"
```

## 4. REAL: database behaviour (run in one transaction that was rolled back; 0 leads and 0 attempts remained afterwards)

| Check | Observed |
|---|---|
| 15 attempts from one address hash, then the 16th | `ok` x15, then `attempts` |
| A different address hash | `ok` |
| 5 stored leads from one address, then another attempt | `leads` |
| Newsletter address twice (different letter case) | second insert -> `unique_violation` (the Function answers both identically) |
| `consent = false` | `check_violation` |
| E-mail without `@` | `check_violation` |
| Membership with an empty name | `check_violation` |
| `purge_lead_metadata()` | cleared `ip_hash` on a 45-day-old lead, deleted the 3-day-old attempt, kept the 1-hour-old attempt, **did not delete the lead row** |
| `anon` selecting leads | `insufficient_privilege` |

## 5. Retention schedule

Job `vbfa-purge-lead-metadata`: `17 3 * * *` (03:17 UTC), command `select public.purge_lead_metadata()`, user `postgres`,
`active = true`. **It has not run yet** (`cron.job_run_details` is empty because the job was created today). First scheduled
run: 2026-10-23 03:17 UTC. To close this item, run `select status, start_time, return_message from cron.job_run_details order by start_time desc limit 3;`
after that time and record the result. The job clears address hashes after 30 days and counters after 2 days; it never
deletes lead rows. The retention period of the lead rows themselves is a client/legal decision that is not made yet.

## 6. Advisors

- Security: only `rls_enabled_no_policy` (INFO) for `form_attempts` and `website_leads`. Expected and intended.
- Performance: `unused_index` INFO on `website_leads_email_idx` (kept: it serves access/deletion requests by e-mail once data exists) and the Auth connection strategy INFO (Auth is not used).

## 7. What this evidence does NOT cover

- The Vercel Function talking to this database. That needs `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, Turnstile keys and
  `LEADS_ENABLED=true` on a Preview, which engineering cannot set (the connector's access to Vercel environment variables is
  forbidden, see `docs/ACTIVATION_RUNBOOK.md`). `scripts/qa/live-e2e.mjs` is ready for it and is itself verified against the
  compiled Function with an emulated database (a mock, not this project).
- Latency from the Function region (`sin1`) to Seoul; measure once the live E2E runs.
