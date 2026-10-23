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
| Turnstile | xác minh phía máy chủ cho **cả hai** form, timeout 3 s; thiếu khoá site hoặc secret ⇒ form trả 503 (không có chế độ "không captcha"); thứ tự: giới hạn tốc độ **trước** captcha để không dội vào Cloudflare | unit test · Function biên dịch. Xác minh thật với khoá thử: **CHƯA** (cần Owner, mục 6) |
| DB không sẵn sàng | timeout 3 s mỗi lệnh gọi; mọi lỗi lưu ⇒ `503 unavailable`; chỉ trả `200` sau khi `insert` thành công | unit test · Function biên dịch (DB giả lập lỗi) |
| Phương thức | `GET` ⇒ `405` + `Allow: POST` + `Cache-Control: no-store` | **THẬT** (`/api/join/` trên Preview `edba4bc`) |
| `no-store` | mọi phản hồi từ handler có `Cache-Control: no-store`; `vercel.json` thêm cho `/api/(.*)` | **THẬT** (405) · unit test (429) |
| Bí mật không lộ ở trình duyệt/log | khoá service-role, `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY` chỉ đọc qua `astro:env/server`; logger che trường nhạy cảm và handler chỉ truyền sự thật không định danh (`kind`, `status`, `durationMs`, mã lỗi ≤ 60 ký tự) | **TĨNH** + unit test log. Quét hôm nay: 0 chuỗi bí mật trong `dist/client`, `.vercel/output/static`, mã nguồn, Studio, scripts, docs; 0 sourcemap công khai; 3 tệp thư viện Supabase trong bundle Function chứa chữ `sb_secret_` (tiền tố khoá trong mã thư viện, không phải khoá). Log thật sau E2E: **CHƯA** (tìm chuỗi email thử trong `get_runtime_logs`) |
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
| Retention / purge | cron `vbfa-purge-lead-metadata` `17 3 * * *`, `active=true`; `cron.job_run_details` = 0 lần chạy lúc 00:02 UTC ngày 2026-10-23 (lần chạy đầu 03:17 UTC) | **THẬT** (lịch) · **CHƯA** (lần chạy đầu: đối chiếu sau 03:17 UTC) |
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
| SEC-O2 | Trung bình | E2E thật Function ↔ Turnstile ↔ Supabase chưa chạy; chưa có bằng chứng log không chứa PII trên dịch vụ thật | Owner đặt biến + bí mật (xem Release packet mục 6) → agent chạy | trước Release B |
| SEC-O3 | Thấp | Chưa xác minh được bằng HTTP rằng khoá anon bị từ chối ở Data API (chỉ có bằng chứng quyền DB) | Owner/CI chạy lệnh `curl` trong runbook | trước Release B |
| SEC-O4 | Thấp | Branch protection và bảo vệ GitHub Environment `vbfa-cms` chưa kiểm chứng | Owner | trước Release A |
| SEC-O5 | Thấp | Function dùng khoá `service_role` (bỏ qua RLS). Nếu lộ, toàn bộ DB bị lộ. Giảm thiểu hiện có: chỉ ở biến môi trường Vercel (Sensitive), không có trong bundle (đã quét), một dự án chỉ chứa dữ liệu lead. Nâng cấp đề xuất sau khi ra mắt: vai trò Postgres riêng chỉ có `EXECUTE` trên một RPC `insert_lead` | Kỹ sư (sau Release B) | sau ra mắt |
| SEC-O6 | Thấp | Thân yêu cầu không có `Content-Length` (chunked) được đọc rồi mới kiểm tra kích thước; Vercel đã giới hạn thân Function 4.5 MB ở tầng nền tảng | Kỹ sư | tuỳ chọn |
| SEC-O7 | Thấp | Honeypot lặng lẽ bỏ qua dữ liệu: trình quản lý mật khẩu điền nhầm trường ẩn có thể làm mất một lượt gửi của người thật. Giảm thiểu: `autocomplete="off"`, `tabindex=-1`, `aria-hidden`; giám sát tỉ lệ `lead.dropped reason=honeypot` / `lead.stored` trong log | Vận hành | 24 giờ đầu sau Release B |
| SEC-O8 | Thấp | Xuất dữ liệu lead ra bảng tính: ô bắt đầu bằng `=`, `+`, `-`, `@` có thể chạy công thức. Khi xuất CSV, thêm dấu nháy đơn đầu ô | Vận hành | trước khi xuất lần đầu |
| SEC-O9 | Thông tin | Nhật ký hạ tầng của Vercel có thể chứa IP; chính sách bảo mật nêu rõ (đang chờ pháp lý duyệt cách diễn đạt) | Pháp lý | trước Release B |
| SEC-O10 | Thông tin | Font SVN còn trong lịch sử Git công khai và deployment production hiện tại (vấn đề giấy phép, không phải lỗ hổng) | Owner | trước Release A |
