# Báo cáo rà soát bảo mật (2026-10-22 / 2026-10-23)

Phạm vi: website Astro trên Vercel, hai Function `/api/join/` và `/api/newsletter/`, Sanity (Studio + Content Lake), Supabase `bzrtllytykldnawbuszu`,
GitHub Actions. Mỗi dòng ghi loại bằng chứng: **THẬT** (quan sát trên dịch vụ thật), **MÔ PHỎNG** (emulator/PGlite/client giả), **TĨNH** (đọc mã/cấu hình),
**CHƯA** (chưa kiểm chứng; ghi rõ ai làm). Không có dòng MÔ PHỎNG hay TĨNH nào được dùng để tuyên bố E2E thật đã PASS.

Kết luận: **không có lỗ hổng mức Cao/Nghiêm trọng mở trong mã.** Còn 1 mục hạ tầng cần chủ dự án (WAF) và 3 mục chưa kiểm chứng được từ sandbox
(HTTP tới Supabase, branch protection, cấu hình biến môi trường Vercel). Chi tiết ở mục 6.

## 1. Bảo mật ứng dụng (header, đầu vào, lạm dụng)

| Yêu cầu | Cài đặt | Bằng chứng |
|---|---|---|
| CSP | `default-src 'self'`; `script-src 'self'` + Cloudflare Turnstile + băm sha256 cho từng script/style nội tuyến (không `unsafe-inline`, không `unsafe-eval`); `img-src 'self' data: https://cdn.sanity.io`; `connect-src 'self'`; `frame-src` chỉ Turnstile; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'self'`. Route CSP do `scripts/finalize-vercel-output.mjs` sinh và kiểm từng trang + 404 | **THẬT** (header trên Preview `/`, `/tin-tuc/`, `/tin-tuc/test/`, 404) · test `finalize-vercel-output.test.mjs` |
| HSTS | `max-age=63072000; includeSubDomains` (không `preload`, có chủ ý cho tới khi domain chính thức chốt) | **THẬT** (mọi phản hồi, kể cả `/api/*`, `robots.txt`) |
| Referrer-Policy | `strict-origin-when-cross-origin` | **THẬT** |
| Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` | **THẬT** |
| X-Content-Type-Options | `nosniff` | **THẬT** |
| Chống clickjacking | `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` | **THẬT** |
| Chặn công cụ tìm kiếm trên Preview | `x-robots-tag: noindex`, `<meta robots noindex,nofollow>`, `robots.txt` = `Disallow: /` | **THẬT** (Preview `edba4bc`) |
| Kiểm tra Origin / CSRF | bắt buộc header `Origin` cùng nguồn hoặc nằm trong `FORM_ALLOWED_ORIGINS`; không dùng cookie xác thực; không có CORS (preflight nhận 405) | MÔ PHỎNG (Function biên dịch, 58 kiểm tra) · unit test |
| Loại nội dung / kích thước | `application/json` bắt buộc (415); ≤ 8 KB theo `Content-Length` và theo thân thực tế (413) | unit test · Function biên dịch |
| Xác thực đầu vào | zod: email (chuẩn hoá chữ thường, ≤ 254), họ tên/tổ chức bắt buộc, độ dài tối đa, điện thoại theo mẫu, `interest` theo danh sách, `utm` chỉ 3 khoá chuẩn, `sourcePath` cắt bỏ query/fragment; lỗi trả `400` kèm bản đồ lỗi theo trường | unit test · Function biên dịch |
| Đồng ý | `consent` phải đúng `true` ở cả hai form; `consentVersion` bắt buộc, dạng `join-v<n>` / `newsletter-v<n>`; thiếu hoặc sai ⇒ 400, không lưu | unit test (commit `7f33afa`) |
| Honeypot | trường ẩn `website` có giá trị ⇒ `200 {ok:true}` giả, **không lưu, không gọi DB** (không tín hiệu cho bot) | unit test · Function biên dịch |
| Gửi quá nhanh | `< 2 s` kể từ lúc mở form ⇒ **`429 too_fast` + `Retry-After: 3`**, không lưu, không gọi DB; thử lại sau vài giây được nhận. Trước đây trả `200` giả — người dùng autofill có thể bị báo "đã lưu" khi chưa lưu (**đã sửa, commit `0f8d102`**) | unit test · Function biên dịch |
| Giới hạn tốc độ | RPC `register_attempt` trong DB: mỗi 10 phút, mỗi mã băm địa chỉ tối đa 15 lượt hợp lệ và 5 lead đã lưu; tính cả lượt trùng/captcha sai; địa chỉ không xác định dùng chung một ngân sách; vượt ⇒ `429 rate_limited` | MÔ PHỎNG (emulator) · **THẬT** (hành vi hàm trên DB thật trong giao dịch hoàn tác, `docs/evidence/SUPABASE_REAL_2026-10-22.md`) |
| Chống gửi trùng | bản tin: chỉ mục duy nhất `lower(email)` khi `kind='newsletter'`; lần lặp trả đúng như lần đầu (`200 {ok:true}`), không lộ ai đã đăng ký | **THẬT** (ràng buộc trên DB) · Function biên dịch |
| Turnstile | xác minh phía máy chủ cho **cả hai** form, timeout 3 s; thiếu khoá site hoặc secret ⇒ form trả 503 (không có chế độ "không captcha"); thứ tự: giới hạn tốc độ **trước** captcha để không dội vào Cloudflare | unit test · Function biên dịch. **THẬT với khoá thử** (2026-10-23, run `39911745667`): thiếu token ⇒ 400 `captcha`, token thử ⇒ 200 và có hàng trong DB; khoá thật: CHƯA (Release B) |
| DB không sẵn sàng | timeout 3 s mỗi lệnh gọi; mọi lỗi lưu ⇒ `503 unavailable`; chỉ trả `200` sau khi `insert` thành công | unit test · Function biên dịch (DB giả lập lỗi) |
| Phương thức | `GET` ⇒ `405` + `Allow: POST` + `Cache-Control: no-store` | **THẬT** (`/api/join/` trên Preview `edba4bc`) |
| `no-store` | mọi phản hồi từ handler có `Cache-Control: no-store`; `vercel.json` thêm cho `/api/(.*)` | **THẬT** (405) · unit test (429) |
| Bí mật không lộ ở trình duyệt/log | khoá service-role, `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY` chỉ đọc qua `astro:env/server`; logger che trường nhạy cảm và handler chỉ truyền sự thật không định danh (`kind`, `status`, `durationMs`, mã lỗi ≤ 60 ký tự) | **TĨNH** + unit test log. Quét hôm nay: 0 chuỗi bí mật trong `dist/client`, `.vercel/output/static`, mã nguồn, Studio, scripts, docs; 0 sourcemap công khai; 3 tệp thư viện Supabase trong bundle Function chứa chữ `sb_secret_` (tiền tố khoá trong mã thư viện, không phải khoá). Log thật sau E2E: **THẬT** — có sự kiện `lead.*`, tìm `example.invalid` và tên thử trong `get_runtime_logs` cho deployment `dpl_DxkZ7gb6…` ⇒ không có dòng nào |
| IP khách | lấy từ `clientAddress` của adapter Vercel (Vercel ghi đè `x-forwarded-for`, khách không giả mạo được); chỉ lưu HMAC-SHA-256 có muối (32 hex); không lưu IP thô, không ghi IP vào log | **TĨNH** + unit test |

## 2. Bảo mật cơ sở dữ liệu (Supabase `bzrtllytykldnawbuszu`) — quan sát lúc 2026-10-23 00:02 UTC

| Hạng mục | Kết quả | Loại |
|---|---|---|
| Schema thật = schema do migration trong repo sinh ra | vân tay 43 dòng `95bf69af89bfa4e96e9a78f4f78def2f` (đo lại hôm nay, không đổi) | **THẬT** |
| RLS | bật trên `website_leads` và `form_attempts`; 0 policy (deny-by-default, chủ ý) | **THẬT** |
| Quyền bảng | `anon` và `authenticated`: **không có quyền nào** trên hai bảng; `service_role`: DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE | **THẬT** |
| Quyền hàm (EXECUTE) | `register_attempt`, `purge_lead_metadata`, `touch_updated_at`, `rls_auto_enable`: `anon=false`, `authenticated=false`, `service_role=true` | **THẬT** |
| SQL injection | không có SQL động (`EXECUTE`/`format`) trong migration; mọi tham số có kiểu; supabase-js gọi PostgREST có tham số | **TĨNH** |
| Hàm SECURITY DEFINER | 2 hàm (`register_attempt`, `purge_lead_metadata`) với `search_path = public`; `anon/authenticated` không có quyền tạo đối tượng trong `public` nên không khai thác được (khuyến nghị: đổi sang `search_path = ''` + tên đủ schema ở lần migration kế tiếp, mức Thấp) | **TĨNH** |
| Ràng buộc | email ≤ 254 và có `@`; `consent = true`; `message ≤ 1000`; `kind` trong danh sách; họ tên bắt buộc với hội viên; duy nhất email bản tin | **THẬT** (hành vi, giao dịch hoàn tác) |
| Security Advisor | 2 INFO `rls_enabled_no_policy` (chủ ý, do mô hình chỉ `service_role` ghi). Performance Advisor: 2 INFO (`website_leads_email_idx` chưa dùng vì bảng rỗng; cấu hình kết nối Auth) — không hành động | **THẬT** (chạy lại hôm nay) |
| Dữ liệu hiện có | `website_leads` = 0 hàng, `form_attempts` = 0 hàng | **THẬT** |
| Retention / purge | cron `vbfa-purge-lead-metadata` `17 3 * * *`, `active=true`; **lần chạy đầu thành công**: `runid 1`, `status=succeeded`, 2026-10-23 03:17:00 UTC, "1 row" (đối chiếu lúc 05:55 UTC, `cron.job_run_details`); `website_leads` = 0, `form_attempts` = 0, `auth.users` = 0 | **THẬT** |
| Data API qua HTTP với khoá anon | **CHƯA** — sandbox chặn `*.supabase.co`; lệnh `curl` kiểm tra có trong `docs/ACTIVATION_RUNBOOK.md` (Owner/CI chạy). Quyền ở trên đã đủ để suy ra `401/403` hoặc rỗng, nhưng đó là suy luận | CHƯA |

Lưu ý thiết kế: chỉ có **một** dự án Supabase (không có staging). Preview bật `LEADS_ENABLED=true` để chạy E2E sẽ ghi vào chính cơ sở dữ liệu này;
các hàng thử có định danh `e2e-…@example.invalid`, kịch bản in sẵn câu lệnh kiểm tra và xoá; sau E2E phải đặt `LEADS_ENABLED` về `false` ở Preview.

## 3. Hạ tầng

| Hạng mục | Kết quả | Loại |
|---|---|---|
| Bảo vệ deployment Preview | Vercel Authentication: `ssoProtection = all_except_custom_domains` | **THẬT** (`get_project`) |
| Workflow E2E thật chỉ chạy trên Preview được bảo vệ | `vbfa-preview-e2e.yml` (trên `main`): chỉ nhận host `vfba-website-*-quangnm.vercel.app`, chặn host production, yêu cầu gõ `write-test-rows`, và **dừng nếu Preview không yêu cầu đăng nhập** (curl phải ra 301–308/401/403) trước khi chạy khoá Turnstile luôn-pass | **TĨNH** (chưa từng chạy: 0 lần) |
| Quyền token GitHub Actions | mọi workflow `permissions: contents: read`; checkout dùng `persist-credentials: false` | **TĨNH** |
| Bí mật GitHub | `SANITY_DEPLOY_TOKEN` (môi trường `vbfa-cms`, đã dùng thành công cho run `39807604001`, không lộ trong log); `VERCEL_PROTECTION_BYPASS` **chưa biết có hay chưa** (không đọc được danh sách secret) | THẬT (Sanity) / CHƯA (bypass) |
| Tách Production / Preview | Production hiện chạy frontend cũ (`f9ef1c0`); mã mới **từ chối build Production nếu thiếu `PUBLIC_SANITY_PROJECT_ID`** (không thể xuất bản tin mẫu như tin thật); `LEADS_ENABLED` phải để trống/false ở Production cho Release A; khoá Turnstile thử không dùng ở Production | THẬT (kiểm thử build cục bộ) · cấu hình biến: **CHƯA** (xem dưới) |
| Biến môi trường Vercel | kết nối của kỹ sư nhận `403` khi **liệt kê** biến (kiểm tra lại 2026-10-22 16:xx UTC) nên **không xác minh được** `PUBLIC_SANITY_*`, `PUBLIC_SITE_INDEXING=off`, `LEADS_ENABLED=false` trên Preview. Quan sát gián tiếp: build đọc được Content Lake thật, Preview `noindex` | CHƯA (trực tiếp) / THẬT (gián tiếp) |
| Vercel WAF / rate limit `/api/*` | `get_firewall_config` trả `404 Seawall Config not found`; kết nối không tạo được quy tắc ⇒ **chưa có quy tắc**. Lớp bảo vệ hiện có: giới hạn trong DB (theo địa chỉ) + Turnstile; WAF là lớp thứ ba chống tràn từ nhiều địa chỉ | CHƯA — **OWNER_ACTION** (runbook mục 4) |
| Branch protection (`main`, nhánh phát hành) | không đọc được qua kết nối | CHƯA — **OWNER_ACTION** |
| Sanity | dataset `production` công khai ở chế độ đọc bài đã xuất bản (bản nháp không lộ); không có `SANITY_API_READ_TOKEN` trong mã/bundle; token deploy chỉ ở GitHub Environment | THẬT (build không cần token) / TĨNH |
| Phụ thuộc (`npm audit`, 2026-10-23) | website (prod): **3 cao** cùng một chuỗi build-time `@astrojs/vercel` → `@vercel/routing-utils` → `path-to-regexp` (không có trong bundle Function, không xử lý đầu vào của khách; bản "sửa" mà npm đưa ra là `@astrojs/vercel@8.0.4`, tức hạ 3 phiên bản chính, không áp dụng). Studio: **16** (7 trung bình, 9 cao), đều nằm trong chuỗi công cụ `sanity`, Studio build ra tệp tĩnh do Sanity host | THẬT (chạy hôm nay) |
| Quét bí mật | xem mục 1 (0 chuỗi bí mật; 0 sourcemap công khai) | THẬT |
| Sẵn sàng rollback | xem `docs/RELEASE_PACKET.md` mục 8 (Release A/B) | TĨNH |

## 4. Quyền riêng tư (liên kết)

Chính sách bảo mật, sổ câu đồng ý, đề xuất thời hạn lưu và quy trình yêu cầu của người có dữ liệu đã soạn **để duyệt**, chưa được duyệt, chưa xuất bản:
`docs/privacy/` (`PRIVACY_POLICY_DRAFT.vi.md`, `CONSENT_TEXTS.vi.md`, `RETENTION_PROPOSAL.vi.md`, `DATA_SUBJECT_REQUESTS.vi.md`, `DATA_MAP.md`).
Điều kiện chặn Release B: mọi mục **[CHỜ OWNER]/[CHỜ PHÁP LÝ]** trong các tài liệu đó được trả lời và duyệt bằng văn bản.

## 5. Đã sửa trong đợt này (lỗi bảo mật/độ tin cậy)

| ID | Mức | Vấn đề | Sửa |
|---|---|---|---|
| SEC-F1 | Trung bình | Gửi form trong < 2 s trả `200 {ok:true}` mà **không lưu**: người dùng thật (autofill) có thể bị báo "đã lưu" khi chưa lưu | `0f8d102`: trả `429 too_fast` + `Retry-After`, không lưu, không gọi DB; test đơn vị + Function biên dịch + `live-e2e.mjs` |
| SEC-F2 | Thấp | Phiên bản câu đồng ý: hội viên mặc định `join-v2` nếu thiếu (gán nhầm), bản tin viết cứng `newsletter-v1` (đổi chữ phải sửa mã) | `7f33afa`: cả hai bắt buộc, dạng `<form>-v<n>`, nội dung + phiên bản do Studio quản lý trong cùng một lần build |
| SEC-F3 | Trung bình | Build Production thiếu `PUBLIC_SANITY_PROJECT_ID` sẽ xuất bản 6 bài mẫu như tin thật | `56f5c60`: build Production bị từ chối với thông báo rõ; Preview/local giữ bộ mẫu và cảnh báo |

## 6. Mở / rủi ro còn lại

| ID | Mức | Nội dung | Ai | Hạn |
|---|---|---|---|---|
| SEC-O1 | Trung bình | Chưa có quy tắc rate limit Vercel WAF cho `/api/*` | Owner (UI) | trước Release B |
| SEC-O2 | Thấp (đã giảm) | E2E thật đã chạy 2026-10-23 (HTTP 24/24, SQL đúng 3 hàng, log không PII: `docs/evidence/E2E_REAL_2026-10-23.md`). Đã xoá hàng thử, `count = 0` (06:38 UTC). Còn: chạy lại với khoá Turnstile thật và luồng trình duyệt thật | agents | trước Release B |
| SEC-O3 | Thấp | Chưa xác minh được bằng HTTP rằng khoá anon bị từ chối ở Data API (chỉ có bằng chứng quyền DB) | Owner/CI chạy lệnh `curl` trong runbook | trước Release B |
| SEC-O4 | Thấp | Branch protection và bảo vệ GitHub Environment `vbfa-cms` chưa kiểm chứng | Owner | trước Release A |
| SEC-O5 | Thấp | Function dùng khoá `service_role` (bỏ qua RLS). Nếu lộ, toàn bộ DB bị lộ. Giảm thiểu hiện có: chỉ ở biến môi trường Vercel (Sensitive), không có trong bundle (đã quét), một dự án chỉ chứa dữ liệu lead. Nâng cấp đề xuất sau khi ra mắt: vai trò Postgres riêng chỉ có `EXECUTE` trên một RPC `insert_lead` | Kỹ sư (sau Release B) | sau ra mắt |
| SEC-O6 | Thấp | Thân yêu cầu không có `Content-Length` (chunked) được đọc rồi mới kiểm tra kích thước; Vercel đã giới hạn thân Function 4.5 MB ở tầng nền tảng | Kỹ sư | tuỳ chọn |
| SEC-O7 | Thấp | Honeypot lặng lẽ bỏ qua dữ liệu: trình quản lý mật khẩu điền nhầm trường ẩn có thể làm mất một lượt gửi của người thật. Giảm thiểu: `autocomplete="off"`, `tabindex=-1`, `aria-hidden`; giám sát tỉ lệ `lead.dropped reason=honeypot` / `lead.stored` trong log | Vận hành | 24 giờ đầu sau Release B |
| SEC-O8 | Thấp | Xuất dữ liệu lead ra bảng tính: ô bắt đầu bằng `=`, `+`, `-`, `@` có thể chạy công thức. Khi xuất CSV, thêm dấu nháy đơn đầu ô | Vận hành | trước khi xuất lần đầu |
| SEC-O9 | Thông tin | Nhật ký hạ tầng của Vercel có thể chứa IP; chính sách bảo mật nêu rõ (đang chờ pháp lý duyệt cách diễn đạt) | Pháp lý | trước Release B |
| SEC-O10 | Thông tin | Font SVN còn trong lịch sử Git công khai và deployment production hiện tại (vấn đề giấy phép, không phải lỗ hổng) | Owner | trước Release A |

## 7. CRM Lead Inbox (Beta), rà soát 2026-10-23

Phạm vi: `/admin/*` (`src/lib/server/crm/`, `src/pages/admin/`, `public/admin/crm.css`), migration `0007` + `0008`, `vercel.json`. Hướng dẫn và kiến trúc: `docs/CRM.vi.md`. Bằng chứng: `docs/evidence/CRM_2026-10-23.md`.

### 7.1 Kiểm soát

| Yêu cầu | Cài đặt | Loại bằng chứng |
|---|---|---|
| Dữ liệu CRM không đọc/ghi được từ trình duyệt | 4 bảng mới: RLS bật, 0 policy, `anon`/`authenticated` không có quyền; 11 hàm `SECURITY DEFINER` (`search_path=""`), `EXECUTE` chỉ cho `service_role` | **THẬT** (truy vấn quyền trên dự án thật; vân tay schema `d78e5f73…` thật = bản dựng từ 8 migration; Security Advisor chỉ INFO `rls_enabled_no_policy`) |
| Không yếu đi quyền hiện có | `website_leads`, `form_attempts` không đổi cột/quyền/policy | **THẬT** (vân tay) · PGlite |
| Xác thực | Supabase Auth, kiểm tra phiên với Supabase **ở mỗi request**, làm mới khi hết hạn | MÔ PHỎNG (Auth giả lập) · **CHƯA THẬT** (chờ bật CRM trên Preview) |
| Phân quyền phía máy chủ | danh sách cho phép `crm_staff` do quản trị quản lý, gắn `user_id` lần đầu, vai trò `admin`/`staff`, phạm vi loại khách; mỗi hàm SQL tự kiểm tra lại | PGlite (36 kiểm thử) · hàm biên dịch (56) |
| 401 / 403 / 404 | chưa đăng nhập 401; đăng nhập nhưng không có quyền 403; khách ngoài phạm vi/đã xoá/id sai 404 (cùng một câu trả lời, không lộ sự tồn tại) | PGlite · hàm biên dịch · Chromium |
| IDOR | thử đọc/đổi trạng thái/ghi chú khách ngoài phạm vi: 404 và dữ liệu không đổi | PGlite · hàm biên dịch |
| Phiên | cookie `__Secure-…` HttpOnly, Secure, SameSite=Strict, Path=/admin; đồng hồ ký HMAC **gắn với người dùng** (không nghỉ 30 phút, tối đa 8 giờ); hết phiên và đăng xuất **thu hồi phiên Supabase** (kể cả khi access token đã hết hạn); đổi mật khẩu thu hồi phiên khác; cookie trùng tên bị từ chối | PGlite · hàm biên dịch · Chromium (cờ cookie, nút Back sau khi đăng xuất) |
| CSRF | chỉ POST từ form cùng nguồn: `Origin` bắt buộc **cùng origin** (không dùng `FORM_ALLOWED_ORIGINS`), `Sec-Fetch-Site`, SameSite=Strict, kiểm tra origin của Astro; `Referrer-Policy: same-origin` (với `no-referrer` trình duyệt gửi `Origin: null` và mọi form bị từ chối: lỗi chức năng đã phát hiện và sửa, mục 7.2 #9) | hàm biên dịch · **Chromium thật** (header `Origin` trình duyệt gửi) |
| Chống dò mật khẩu | giới hạn theo địa chỉ (20/10 phút) và theo cặp (email, địa chỉ) (8/10 phút), chỉ lưu băm HMAC có muối, lượt bị từ chối không được lưu; người lạ ở địa chỉ khác không khoá được người thật; 4 trường hợp lỗi cho cùng một thông báo | PGlite · hàm biên dịch |
| Không cache, không index | `Cache-Control: private, no-store, max-age=0`, `X-Robots-Tag: noindex…`, `X-Frame-Options: DENY`, CSP `default-src 'none'; style-src 'self'` (không script), `robots.txt` chặn `/admin/`, `vercel.json` đặt lại các header ở tầng nền tảng | **THẬT** ở trạng thái tắt (Preview trả 404 với đủ header: `x-frame-options: DENY`, CSP, `cache-control: private, no-store, max-age=0`, `x-vercel-cache: MISS`) · hàm biên dịch |
| XSS | mẫu HTML tự escape; không `<script>`, `<style>`, thuộc tính `style=`/`on*` | PGlite · hàm biên dịch · Chromium |
| Log không dữ liệu cá nhân | chỉ `route`, `status`, `role`, `durationMs`, mã lỗi cố định; nhãn lỗi lạ rút về tên lớp | unit test · hàm biên dịch (log của tiến trình) |
| Tắt mặc định, đóng khi thiếu cấu hình | `CRM_ENABLED` khác `true` ⇒ 404; thiếu khoá/muối/HTTPS ⇒ 503, không gọi backend | hàm biên dịch (6 tổ hợp) · **THẬT** (404 trên Preview) |
| Nhật ký thao tác | đăng nhập/đăng xuất/từ chối, mở khách, đổi trạng thái (từ→sang), ghi chú (chỉ id), đổi người dùng; không có dữ liệu cá nhân của khách | PGlite · hàm biên dịch |

### 7.2 Rà soát độc lập (một tác nhân khác, chỉ đọc mã) và cách xử lý

Kết quả: không có mức Nghiêm trọng/Cao. Các phát hiện và trạng thái:

| # | Mức | Phát hiện | Xử lý |
|---|---|---|---|
| 1 | Trung bình | Khoá tài khoản bởi người lạ: bất kỳ ai gửi 9 lượt đăng nhập với email của quản trị khoá được họ; lượt bị từ chối vẫn được ghi và kéo dài khoá; xoá hàng cũ quét cả bảng | **ĐÃ SỬA** (`0008` + Function): nhóm theo (email, địa chỉ); lượt bị từ chối không ghi; chỉ mục `created_at`; kiểm thử "người lạ không khoá được người thật" |
| 2 | Trung bình | Lần đăng nhập đầu gắn tài khoản chỉ dựa vào email: nếu cho phép đăng ký công khai (hoặc tài khoản được tạo trước), người đến trước chiếm quyền | **GIẢM THIỂU + CỔNG BẮT BUỘC**: tắt "Allow new users to sign up" (kiểm tự động trong `live-crm-e2e.mjs`, **ĐỎ nếu còn bật**); chỉ chấp nhận tài khoản đã xác nhận email; thứ tự tạo: tài khoản Auth trước, hàng cho phép sau (`docs/CRM.vi.md` 5.1). Rủi ro còn lại ghi ở SEC-C1 |
| 3 | Trung bình/Thấp | Đồng hồ phiên không gắn người dùng (ghép với cookie đánh cắp của người khác); hết phiên không thu hồi refresh token; đăng xuất khi access token đã hết hạn không thu hồi | **ĐÃ SỬA**: đồng hồ ký kèm `user_id`; hết phiên và đăng xuất dùng refresh token để thu hồi |
| 4 | Thấp | Cuộc đua "quản trị cuối cùng" (hai yêu cầu đồng thời) và quản trị chưa từng đăng nhập vẫn được tính | **ĐÃ SỬA** (`0008`): khoá `pg_advisory_xact_lock`; chỉ đếm quản trị đã đăng nhập |
| 5 | Thấp | Đổi mật khẩu không kết thúc các phiên khác | **ĐÃ SỬA**: `logout?scope=others` |
| 6 | Thấp | Hàm SQL cho phép liệt kê khách `deleted` (chờ xoá) | **ĐÃ SỬA** (`0008`): từ chối `deleted`, CSDL tự bảo đảm điều giao diện giả định |
| 7 | Thấp | Mỗi request của người bị vô hiệu hoá ghi một dòng `denied` | **ĐÃ SỬA**: chỉ ghi lúc đăng nhập |
| 8 | Thấp | Từ khoá tìm kiếm (tên/email) nằm trong URL (GET): có thể xuất hiện trong nhật ký request của Vercel và lịch sử trình duyệt | **CHẤP NHẬN CHO BETA** (SEC-C2): đã nêu trong `DATA_MAP.md`; đề xuất chuyển tìm kiếm sang POST + cookie trước Release B nếu pháp lý yêu cầu |
| 9 | Thấp/Thông tin | Cổng CSRF dùng chung danh sách origin của form công khai; và `Referrer-Policy: no-referrer` làm trình duyệt gửi `Origin: null` | **ĐÃ SỬA**: CRM chỉ cùng origin; `Referrer-Policy: same-origin` (header + meta + `vercel.json`). **Đây là lỗi chức năng P0 thật**: Chromium gửi `Origin: null` cho form cùng nguồn khi `no-referrer`, mọi nút trong CRM sẽ bị 403. Bộ kiểm thử trình duyệt cũ che mất lỗi này vì lớp giả lập Origin; nay có kiểm tra "trình duyệt gửi đúng Origin" |
| 10 | Thông tin | Cookie trùng tên (cookie tossing từ tên miền con) | **ĐÃ SỬA**: tên trùng ⇒ coi như chưa đăng nhập |
| 11 | Thông tin | NUL trong ô tìm/ghi chú gây 503; cookie làm mới bị mất khi trang lỗi; đọc thân yêu cầu trước xác thực; ghi đè trạng thái `qualified`; chặn tốc độ bị vòng qua khi gọi thẳng Supabase `/token`; chưa bắt buộc MFA | NUL và cookie: **ĐÃ SỬA**. Còn lại **ghi nhận**: thân ≤ 32 KB (nền tảng giới hạn 4,5 MB); `qualified` ghi đè là chủ ý; giới hạn của Supabase Auth áp dụng cho `/token` (Owner có thể bật CAPTCHA/time-box phiên trong Supabase); MFA: giới hạn đã biết |

### 7.3 Mở / rủi ro còn lại của CRM

| ID | Mức | Nội dung | Ai | Hạn |
|---|---|---|---|---|
| SEC-C1 | Trung bình | Gắn tài khoản theo email phụ thuộc việc **tắt đăng ký công khai** của Supabase Auth và việc tạo tài khoản Auth trước hàng cho phép | Owner (Bước 7b của `OWNER_SETUP_GUIDE.vi.md`) | trước khi dùng dữ liệu thật |
| SEC-C2 | Thấp | Từ khoá tìm kiếm trong URL (nhật ký Vercel, lịch sử trình duyệt) | Owner/pháp lý quyết | trước Release B |
| SEC-C3 | Thấp | Chưa bắt buộc MFA; Supabase Auth có tuỳ chọn MFA, CAPTCHA, time-box phiên (một số cần gói trả phí, **không bật khi chưa được phê duyệt chi phí**) | Owner | trước Release B |
| SEC-C4 | Trung bình | Quy tắc WAF/rate limit cho `/api/*` và `/admin/*`: kết nối Vercel trả `404 Seawall Config not found` cho cả đọc, `PATCH` và `PUT` (đã thử 3 cách) nên **chưa có quy tắc**. Mô tả quy tắc đề xuất: đường dẫn bắt đầu bằng `/api/` hoặc `/admin/`, giới hạn 120 yêu cầu/phút/IP, hành động từ chối 1 phút | Owner (UI Vercel → Firewall) | trước Release B |
| SEC-C5 | — | Chưa có kết quả THẬT cho đăng nhập/RBAC/IDOR trên Preview (cần Bước 7) | Owner bật CRM; kỹ sư chạy `live-crm-e2e.mjs` | trước khi tuyên bố Beta |

