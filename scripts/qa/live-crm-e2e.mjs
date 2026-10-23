/**
 * LIVE end-to-end of the CRM (/admin/*) on a DEPLOYED, protected Preview wired to the real Supabase project (real Supabase Auth,
 * real Postgres). Called by live-e2e.mjs after the form tests, so the synthetic leads those tests just stored are the ones the
 * CRM is checked against (form -> database -> CRM). No dependencies, Node 22+ (bcryptjs is installed into a temp dir only when
 * the synthetic accounts must be provisioned).
 *
 * Synthetic accounts (".invalid" addresses can never receive mail): admin, staff (all lead kinds), news (newsletter only) and an
 * outsider (a valid Auth user that is NOT on the CRM allowlist). Their passwords are DERIVED, never stored anywhere:
 *   password = "Pw-" + first 40 hex of HMAC-SHA256(key = VERCEL_PROTECTION_BYPASS, "vbfa-crm-e2e-v1:<role>")
 * so only a run that holds the repository secret can sign in, and nobody has to type or paste a password. If the accounts do not
 * exist yet the script prints the provisioning SQL (bcrypt HASHES only) and exits with code 3.
 *
 * What this proves (real services): sign-in against Supabase Auth, the allowlist and role gating, lead scope (IDOR), status
 * workflow and notes against the real database, logout revoking the Auth session, cache/robots headers as served by Vercel.
 * What it does not: browser rendering (see crm-browser.mjs), session idle/absolute expiry (unit-tested; the clock is not ours).
 */
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Public by design (documented in docs/OPERATIONS.md): used only to read the Auth server's public settings.
const supabaseUrl = () => process.env.LIVE_E2E_SUPABASE_URL ?? 'https://bzrtllytykldnawbuszu.supabase.co';
const publishableKey = () => process.env.LIVE_E2E_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable__yum5tUJdlQAjBw08FJDpQ_Lef4GGoZ';

export const ACCOUNTS = {
  admin: { email: 'crm-e2e-admin@vbfa-beta.invalid', role: 'admin', kinds: ['membership', 'newsletter', 'contact'] },
  staff: { email: 'crm-e2e-staff@vbfa-beta.invalid', role: 'staff', kinds: ['membership', 'newsletter', 'contact'] },
  news: { email: 'crm-e2e-news@vbfa-beta.invalid', role: 'staff', kinds: ['newsletter'] },
  outsider: { email: 'crm-e2e-outsider@vbfa-beta.invalid', role: null, kinds: [] },
};

export const derivePassword = (secret, who) => `Pw-${createHmac('sha256', secret).update(`vbfa-crm-e2e-v1:${who}`).digest('hex').slice(0, 40)}`;

function provisioningSql(secret) {
  const tmp = mkdtempSync(join(tmpdir(), 'bcrypt-'));
  execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', tmp, 'bcryptjs@2.4.3'], { stdio: 'ignore' });
  const bcrypt = createRequire(`${tmp}/x.js`)('bcryptjs');
  const blocks = Object.entries(ACCOUNTS).map(([who, a]) => {
    const hash = bcrypt.hashSync(derivePassword(secret, who), 10);
    return `  perform pg_temp.vbfa_e2e_user('${a.email}', '${hash}');`;
  });
  const allow = Object.values(ACCOUNTS).filter((a) => a.role).map((a) => `('${a.email}', '${a.role}', array[${a.kinds.map((k) => `'${k}'`).join(', ')}], 'live-e2e')`);
  return `-- Provision the synthetic CRM test accounts (idempotent). Hashes only; the passwords are derived from a repository secret.
create function pg_temp.vbfa_e2e_user(p_email text, p_hash text) returns void language plpgsql as $f$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email, p_hash, now(),
            '{"provider":"email","providers":["email"]}', '{"synthetic":true}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, jsonb_build_object('sub', uid::text, 'email', p_email, 'email_verified', true), 'email', uid::text, now(), now(), now());
  else
    update auth.users set encrypted_password = p_hash, banned_until = null, email_confirmed_at = coalesce(email_confirmed_at, now()) where id = uid;
  end if;
end $f$;
do $$ begin
${blocks.join('\n')}
end $$;
insert into public.crm_staff (email, role, kinds, created_by) values
  ${allow.join(',\n  ')}
on conflict (email) do update set role = excluded.role, kinds = excluded.kinds, active = true;
`;
}

export async function runLiveCrm({ base, bypass, origin, run, email, check }) {
  console.log('\n— CRM (real Supabase Auth + database) —');
  const headersBase = { 'user-agent': 'vbfa-live-e2e/1.0', ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}) };
  const client = () => {
    const jar = new Map();
    const call = async (path, { form, from = origin, headers = {}, method } = {}) => {
      const h = { ...headersBase, ...headers };
      if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
      let body;
      if (form) {
        method = 'POST';
        h['content-type'] = 'application/x-www-form-urlencoded';
        body = new URLSearchParams(Object.entries(form).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))).toString();
        if (from) h.origin = from;
      }
      const response = await fetch(base + path, { method: method ?? 'GET', headers: h, body, redirect: 'manual' });
      const setCookies = response.headers.getSetCookie();
      for (const line of setCookies) {
        const [pair] = line.split(';');
        const at = pair.indexOf('=');
        const value = decodeURIComponent(pair.slice(at + 1));
        if (/Max-Age=0/i.test(line) || value === '') jar.delete(pair.slice(0, at));
        else jar.set(pair.slice(0, at), value);
      }
      const text = await response.text();
      return { status: response.status, headers: response.headers, text, location: response.headers.get('location'), setCookies };
    };
    return { call, jar };
  };
  const login = (c, who, password) => c.call('/admin/login/', { form: { email: ACCOUNTS[who].email, password: password ?? derivePassword(bypass ?? '', who) } });
  const header = (r, name) => r.headers.get(name) ?? '';

  // 0. Is the CRM on for this Preview, and is public sign-up off?
  const anon = client();
  const entry = await anon.call('/admin/login/');
  if (entry.status === 404) {
    console.log('SKIP  CRM is not enabled on this Preview (CRM_ENABLED is not "true"). Nothing in /admin/ was tested.');
    return 'skipped';
  }
  if (entry.status === 503) {
    check('CRM is enabled but configured (Supabase URL, service-role key, publishable key, salt)', false, '503: a variable is missing on this Preview');
    return 'misconfigured';
  }
  check('/admin/login/ answers 200 on the Preview', entry.status === 200 && /Đăng nhập CRM/.test(entry.text), `${entry.status}`);

  const settings = await fetch(`${supabaseUrl()}/auth/v1/settings`, { headers: { apikey: publishableKey() } }).then((r) => r.json()).catch(() => ({}));
  check('Supabase Auth: public sign-up is DISABLED (invitation only)', settings.disable_signup === true, `disable_signup=${settings.disable_signup} — Owner: Authentication > Sign In / Providers > turn off "Allow new users to sign up"`);

  // 1. Anonymous access
  const unauth = await Promise.all(['/admin/leads/', '/admin/staff/', '/admin/account/'].map((p) => anon.call(p)));
  check('anonymous visitor: every protected page answers 401 and shows no data', unauth.every((r) => r.status === 401 && !/example\.invalid/.test(r.text)), unauth.map((r) => r.status).join(','));
  const sample = unauth[0];
  check('served headers: private no-store, noindex, DENY framing, script-free CSP, never a CDN hit', header(sample, 'cache-control') === 'private, no-store, max-age=0' && /noindex/.test(header(sample, 'x-robots-tag')) && /DENY/i.test(header(sample, 'x-frame-options')) && /default-src 'none'/.test(header(sample, 'content-security-policy')) && !/script-src|unsafe-/.test(header(sample, 'content-security-policy')) && !/hit/i.test(header(sample, 'x-vercel-cache')), JSON.stringify({ cc: header(sample, 'cache-control'), xfo: header(sample, 'x-frame-options'), csp: header(sample, 'content-security-policy').slice(0, 60), cache: header(sample, 'x-vercel-cache') }));
  check('anonymous state-changing post -> 401', (await anon.call('/admin/leads/00000000-0000-4000-8000-000000000001/status/', { form: { from: 'new', to: 'closed' } })).status === 401);
  check('cross-origin post is refused before anything else (403)', (await anon.call('/admin/login/', { form: { email: 'a@b.co', password: 'x' }, from: 'https://evil.example' })).status === 403);

  // 2. Accounts
  if (!bypass) {
    check('the synthetic accounts need VERCEL_PROTECTION_BYPASS to derive their passwords', false, 'secret not available to this run');
    return 'no-secret';
  }
  const outsider = client();
  const probe = await login(outsider, 'staff');
  if (probe.status === 401) {
    console.log('\nThe synthetic CRM accounts are missing or their passwords differ. Provisioning SQL (hashes only; run it once, then re-run this workflow):\n');
    console.log(provisioningSql(bypass));
    check('synthetic CRM accounts exist', false, 'NOT PROVISIONED: run the SQL printed above in the Supabase SQL editor (or ask the engineer to run it through the connector)');
    return 'not-provisioned';
  }

  const staff = client();
  const staffIn = await login(staff, 'staff');
  check('staff signs in with real Supabase Auth: 303 to the inbox, three hardened cookies', staffIn.status === 303 && staffIn.location === '/admin/leads/' && staffIn.setCookies.length === 3 && staffIn.setCookies.every((c) => /^__Secure-vbfa-/.test(c) && /HttpOnly/.test(c) && /Secure/.test(c) && /SameSite=Strict/.test(c) && /Path=\/admin/.test(c)), `${staffIn.status} ${staffIn.setCookies.map((c) => c.split(';')[0].split('=')[0]).join(',')}`);
  const outsiderIn = await login(client(), 'outsider');
  check('a valid Auth user who is not on the allowlist is refused with the same answer as a wrong password', outsiderIn.status === 401 && outsiderIn.setCookies.every((c) => /Max-Age=0/.test(c)));
  const wrong = await login(client(), 'staff', 'definitely-not-the-password');
  check('wrong password -> 401, no session cookie', wrong.status === 401 && wrong.setCookies.every((c) => /Max-Age=0/.test(c)));

  // 3. Form -> database -> CRM
  const mail = { member: email('member'), news: email('news'), limit: email('ratelimit') };
  const list = await staff.call(`/admin/leads/?q=${encodeURIComponent(`-${run}@example.invalid`)}`);
  check('the three synthetic leads stored by the form tests appear in the CRM inbox', list.status === 200 && [mail.member, mail.news, mail.limit].every((m) => list.text.includes(m)) && /Hiển thị 1–3 trong 3 kết quả/.test(list.text), `${list.status} ${(list.text.match(/Hiển thị[^<]*/) ?? ['no counter'])[0]}`);
  const id = (new RegExp(`/admin/leads/([0-9a-f-]{36})/">Xem<span class="sr"> E2E`).exec(list.text) ?? [])[1];
  check('the membership lead has a detail link', Boolean(id));
  if (!id) return 'failed';
  const detail = await staff.call(`/admin/leads/${id}/`);
  check('detail shows consent version join-v2, consent time and source page from the real row', detail.status === 200 && /join-v2/.test(detail.text) && /Thời điểm đồng ý/.test(detail.text) && /<code>\/<\/code>/.test(detail.text) && !/ip_hash/.test(detail.text));

  // 4. Authorization on real data
  const news = client();
  await login(news, 'news');
  const newsList = await news.call(`/admin/leads/?q=${encodeURIComponent(`-${run}@example.invalid`)}`);
  check('scope: a newsletter-only person sees the newsletter leads and not the membership lead', newsList.status === 200 && newsList.text.includes(mail.news) && !newsList.text.includes(mail.member));
  const idor = [await news.call(`/admin/leads/${id}/`), await news.call(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'closed' } }), await news.call(`/admin/leads/${id}/note/`, { form: { body: 'idor attempt' } })];
  check('IDOR: the same person gets 404 for the membership lead (read, status, note)', idor.every((r) => r.status === 404), idor.map((r) => r.status).join(','));
  check('RBAC: staff cannot open staff management (403)', (await staff.call('/admin/staff/')).status === 403);
  const admin = client();
  await login(admin, 'admin');
  const staffPage = await admin.call('/admin/staff/');
  check('RBAC: an administrator can (200) and sees the synthetic accounts', staffPage.status === 200 && staffPage.text.includes(ACCOUNTS.staff.email));

  // 5. Workflow and notes against the real database
  const s1 = await staff.call(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'contacted' } });
  const stale = await staff.call(`/admin/leads/${id}/status/`, { form: { from: 'new', to: 'closed' } });
  const note = await staff.call(`/admin/leads/${id}/note/`, { form: { body: 'Ghi chú E2E tự động.\nCó thể xoá.' } });
  const afterNote = await staff.call(`/admin/leads/${id}/`);
  const s2 = await staff.call(`/admin/leads/${id}/status/`, { form: { from: 'contacted', to: 'closed' } });
  const closed = await staff.call(`/admin/leads/${id}/`);
  check('status New -> In progress -> Closed through the real database (stale form = conflict, not overwrite)', s1.location?.endsWith('done=status') && stale.location?.endsWith('done=conflict') && s2.location?.endsWith('done=status') && /badge--closed/.test(closed.text), `${s1.location} ${stale.location} ${s2.location}`);
  check('internal note saved with author, time and line break', note.status === 303 && /Ghi chú E2E tự động\./.test(afterNote.text) && afterNote.text.includes(ACCOUNTS.staff.email) && /<time datetime=/.test(afterNote.text));
  check('markup-free pages: no script, inline style or handler in what Vercel served', [list, detail, afterNote, staffPage].every((r) => !/<script|<style|\sstyle=|\son[a-z]+=/i.test(r.text)));

  // 6. Sessions: logout revokes the real Auth session; a copied cookie is dead; forged cookies are dead
  const spare = client();
  await login(spare, 'staff');
  const copy = client();
  for (const [k, v] of spare.jar) copy.jar.set(k, v);
  const bye = await spare.call('/admin/logout/', { form: {} });
  check('logout: 303 to the login page and all three cookies expired', bye.status === 303 && bye.location === '/admin/login/?done=out' && bye.setCookies.length === 3 && bye.setCookies.every((c) => /Max-Age=0/.test(c)));
  check('a cookie copied before logout no longer works (Supabase revoked the session): 401', (await copy.call('/admin/leads/')).status === 401);
  const forged = client();
  forged.jar.set('__Secure-vbfa-at', 'eyJhbGciOiJIUzI1NiJ9.e30.forged');
  forged.jar.set('__Secure-vbfa-rt', 'forged-refresh-token');
  forged.jar.set('__Secure-vbfa-ss', `${Date.now()}.${Date.now()}.${'0'.repeat(64)}`);
  check('forged tokens and session clock: 401', (await forged.call('/admin/leads/')).status === 401);
  const tampered = client();
  for (const [k, v] of staff.jar) tampered.jar.set(k, k === '__Secure-vbfa-ss' ? v.replace(/^(\d+)/, (m) => String(Number(m) + 1)) : v);
  check('a session clock edited by hand is rejected: 401', (await tampered.call('/admin/leads/')).status === 401);

  // 7. Throttle (last: it uses part of this runner's sign-in budget)
  const guesses = [];
  const brute = client();
  for (let i = 0; i < 10; i++) guesses.push((await brute.call('/admin/login/', { form: { email: `crm-e2e-throttle-${run}@vbfa-beta.invalid`, password: `guess-${i}` } })).status);
  check('sign-in throttle: nine guesses at one address end in 429 (real database counters)', guesses.slice(0, 8).every((s) => s === 401) && guesses.slice(8).every((s) => s === 429), guesses.join(','));

  return 'ran';
}
