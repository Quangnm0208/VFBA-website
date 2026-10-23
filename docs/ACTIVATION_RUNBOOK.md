# Runbook kích hoạt dịch vụ thật (Sanity · Supabase · Vercel · Turnstile)

Cập nhật 2026-10-22. Tài liệu này là danh sách việc **còn lại** sau khi kỹ sư đã làm mọi thứ có thể làm với quyền hiện có.
Không có bí mật nào nằm trong repo hay trong tài liệu này: chỉ có **tên biến**. Giá trị bí mật được nhập trực tiếp trên
Vercel / GitHub / Sanity, không dán vào chat, PR hay issue.

## 0. Hiện trạng (đã kiểm chứng, không phải giả định)

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Supabase `bzrtllytykldnawbuszu` (VBFA, Seoul) | Schema, RLS, quyền, retention cron, advisor đã kiểm chứng trên DB thật | `docs/evidence/SUPABASE_REAL_2026-10-22.md` |
| Kết nối Function ↔ Supabase thật | **Chưa chạy** (thiếu `SUPABASE_SERVICE_ROLE_KEY` trên Vercel) | mục 3 |
| Sanity `iqyx5ttc` / `production` | Studio build được với đúng Project ID; **chưa deploy, chưa import, chưa có webhook** (kỹ sư không có token Sanity; mạng sandbox chặn `*.sanity.io`) | mục 2 |
| Vercel | Kết nối của kỹ sư **không** có quyền đọc/ghi biến môi trường (403) và không tạo được cấu hình WAF (404 "config not found") | mục 1, 4 |
| Turnstile | Chưa cấu hình. Preview dùng khoá thử nghiệm công khai của Cloudflare; production cần widget thật | mục 1 |

## 1. Vercel: biến môi trường cho Preview có dịch vụ thật

Chỉ áp dụng cho **một nhánh Preview** để các Preview khác (và Production) không bị đổi:

Vercel → project `vfba-website` → Settings → Environment Variables → Add → Environment **Preview** → *Select a custom Preview
branch* = `feat/vbfa-services-activation-20261022`.

| Biến | Giá trị / nguồn | Loại |
|---|---|---|
| `PUBLIC_SANITY_PROJECT_ID` | `iqyx5ttc` | Plain. **Chỉ thêm sau khi đã import seed (mục 2.3)**; dataset rỗng làm build dừng với thông báo "no published articles" |
| `PUBLIC_SANITY_DATASET` | `production` | Plain |
| `PUBLIC_SANITY_API_VERSION` | `2026-10-01` | Plain |
| `SUPABASE_URL` | `https://bzrtllytykldnawbuszu.supabase.co` | Plain |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (khoá `service_role`/secret) | **Sensitive**. Không bao giờ vào Git/chat/frontend |
| `IP_HASH_SALT` | `openssl rand -hex 32` chạy trên máy bạn | **Sensitive** |
| `LEADS_ENABLED` | `true` (chỉ trên nhánh Preview này) | Plain |
| `PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` (khoá thử nghiệm công khai của Cloudflare, luôn qua) | Plain. Đọc lúc **build**: đổi rồi phải redeploy |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` (khoá thử nghiệm công khai, luôn qua) | Sensitive |
| `PUBLIC_SITE_INDEXING` | để trống/`off` | không đổi |

**Production giữ nguyên**: `LEADS_ENABLED` không đặt (hoặc `false`), không có khoá Supabase/Turnstile trên Production, `PUBLIC_SITE_INDEXING=off`.
Khoá Turnstile **thật** (widget theo tên miền) chỉ thêm cho Production sau quyết định GO; xem `docs/OPERATIONS.md` mục C.

Sau khi lưu biến: push một commit hoặc Redeploy nhánh `feat/vbfa-services-activation-20261022` để biến có hiệu lực.

## 2. Sanity (Studio, quyền biên tập, nội dung, webhook)

### 2.1 Token và deploy Studio (một lần, bởi Administrator của project)

1. sanity.io/manage → project `iqyx5ttc` → API → Tokens → tạo token quyền **Deploy Studio**; tạo thêm token **Editor** cho bước import. Sao chép ngay (chỉ hiện một lần).
2. GitHub → repo → Settings → Secrets and variables → Actions: thêm `SANITY_DEPLOY_TOKEN` và `SANITY_IMPORT_TOKEN`.
3. Actions → **Sanity activation (manual)** → Run workflow: `studio_host` = tên miền con chưa ai dùng (mặc định `vbfa`), tick *deploy_studio*, **không** tick *import_seed*.
4. Ghi lại URL Studio thật (`https://<host>.sanity.studio`) từ summary của job. Nếu tên đã bị chiếm, chọn tên khác và chạy lại.
5. Xoá hai token sau khi xong nếu không cần dùng lại.

Workflow này **chưa từng được chạy** (kỹ sư không có token); nếu nó lỗi, lệnh tương đương trên máy có đăng nhập:
`cd studio && SANITY_STUDIO_PROJECT_ID=iqyx5ttc npx sanity deploy`.

### 2.2 Thành viên Marketing và quyền

manage → project → Members → Invite từng người (mỗi người một email, không dùng chung tài khoản), vai trò **Editor**
(chỉnh sửa và xuất bản). **Kiểm tra gói thật** ở Billing: nếu gói không cấp được vai trò Editor cho số người cần,
dừng và xin chủ dự án phê duyệt trước khi nâng gói. Ghi bảng "tên · email · vai trò · ngày mời · đã đăng nhập" vào biên bản nghiệm thu.

### 2.3 Import nội dung seed (chỉ sau khi Marketing duyệt)

Bài 4-10 và các ngày xuất bản trong seed là **mẫu**; dataset `production` mặc định đọc được công khai qua API. Chỉ import khi chấp nhận điều đó cho giai đoạn UAT.
Actions → Sanity activation → tick *import_seed*. Nó chạy `sanity dataset import ... --missing`, nên **không ghi đè** nội dung đã có.

### 2.4 Webhook → Preview (không bao giờ trỏ vào Production)

1. Vercel → Settings → Git → **Deploy Hooks** → tên `sanity-preview`, nhánh `feat/vbfa-services-activation-20261022` → sao chép URL (coi là bí mật).
2. Sanity manage → API → Webhooks → Create: Dataset `production`; URL = Deploy Hook; Trigger on **Create, Update, Delete**; Filter
   `_type in ["article","page","homePage","newsPage","siteSettings","popup"]`; HTTP method POST; **tắt** "Include drafts".
   (Test `scripts/webhook-filter.test.mjs` đảm bảo bộ lọc này luôn khớp schema.)

### 2.5 Nghiệm thu Sanity (Marketing + kỹ sư)

| Bước | Kết quả mong đợi | Ai xác minh |
|---|---|---|
| Marketing đăng nhập Studio | thấy 6 loại tài liệu | Marketing |
| Tạo bài mới, Publish | webhook "Attempts" 200; Preview mới có trang bài, `/tin-tuc/`, `sitemap.xml`, `search-index.json` | kỹ sư lấy HTML qua kết nối Vercel |
| Sửa tiêu đề, Publish | trang đổi tiêu đề | như trên |
| **Unpublish** bài | trang bài trả 404 (có CSP), bài biến khỏi danh sách, `search-index.json`, `sitemap.xml` | như trên |
| Nội dung sai (import qua CLI: slug viết hoa) | build **thất bại**, Preview cũ vẫn chạy | `docs/OPERATIONS.md` mục E.5 |
| Bài có ngày tương lai | **không** hiện cho tới lần build kế tiếp (site tĩnh). Giảm thiểu: đăng đúng lúc, hoặc Scheduled Publishing của Sanity, hoặc bộ kiểm tra hằng giờ `scheduled-publish.yml` (tắt mặc định, chỉ chạy sau khi release lên `main`; xem OPERATIONS.md E.7) | ghi nhận giới hạn |

## 3. Kiểm thử E2E thật cho hai form (Preview, danh tính thử)

Điều kiện: mục 1 đã xong và Preview đã redeploy. Cần *Protection Bypass for Automation* (Vercel → Settings → Deployment Protection) nếu Preview đang bị bảo vệ.

```bash
LIVE_E2E_BASE_URL=https://<preview-của-nhánh>.vercel.app \
LIVE_E2E_CONFIRM=write-test-rows \
VERCEL_PROTECTION_BYPASS=<secret-bypass> \
node scripts/qa/live-e2e.mjs
```

Script từ chối chạy nếu thiếu `LIVE_E2E_CONFIRM` hoặc nếu host là alias production. Nó kiểm tra 405/403/415/413/400/200 (bot)/400
(thiếu đồng ý, sai phiên bản đồng ý, thiếu captcha)/200 (hợp lệ)/200 giống hệt (trùng bản tin)/429 (rate limit), rồi **in ra SQL xác minh
và SQL dọn dẹp**. Chạy SQL xác minh trong Supabase SQL editor (mong đợi đúng 3 hàng: 1 membership, 2 newsletter), lưu kết quả, rồi chạy SQL dọn dẹp.
Script chỉ nhìn thấy HTTP; **chỉ khi cả hai phần (HTTP PASS + SQL đúng 3 hàng) cùng có mới được ghi "E2E thật: PASS"**.

Các tình huống chưa tự động được và cách làm tay:
- **CAPTCHA sai (token không hợp lệ)**: đổi tạm `TURNSTILE_SECRET_KEY` thành khoá thử nghiệm luôn-từ-chối `2x0000000000000000000000000000000AA`, redeploy, gửi lại một form → 400 `captcha`; trả khoá về `1x...AA`.
- **DB không sẵn sàng**: đổi tạm `SUPABASE_URL` sai trên nhánh Preview → form trả 503, không hàng nào được tạo; trả lại.
- **Nhật ký không chứa dữ liệu cá nhân**: Vercel → Logs, lọc `lead.`; không được thấy e-mail, tên, IP, khoá.
- **Data API với khoá anon**: ba lệnh `curl` trong `docs/evidence/SUPABASE_REAL_2026-10-22.md` mục 3.

## 4. Vercel WAF: giới hạn tốc độ cho `/api/*`

Kết nối của kỹ sư không tạo được cấu hình firewall (API trả 404 "config not found"), nên làm trên giao diện:
Vercel → project → Firewall → Configure → Add Rule:
- Tên `VBFA API rate limit`; điều kiện: **Request Path** *starts with* `/api/`;
- Action **Rate Limit**: Fixed window, 60 s, 30 yêu cầu, key **IP**; khi vượt: mặc định (429), thời gian chặn 10 phút;
- Lưu và **Publish**.
Kiểm tra: gửi 40 yêu cầu `GET /api/join/` liên tiếp từ một IP → từ yêu cầu thứ 31 nhận 429 từ Vercel (khác với 429 `rate_limited` của ứng dụng, có JSON). Ghi lại kết quả. Đây là lớp chặn lũ; ứng dụng vẫn tự giới hạn 15 lượt/10 phút/địa chỉ trong DB.

## 5. Bí mật nằm ở đâu (kiểm tra lần cuối trước GO)

- `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY`: chỉ trong Vercel (Sensitive). Không trong repo (đã quét mã nguồn, bundle client, bundle Function: không có chuỗi dạng khoá).
- Deploy Hook URL: chỉ trong Vercel và trong cấu hình webhook Sanity.
- `SANITY_*_TOKEN`, `VERCEL_PROTECTION_BYPASS`: chỉ trong GitHub Secrets / máy người chạy.
- Khoá xuất hiện trong chat hoặc ảnh chụp màn hình phải được **xoay ngay** (Supabase: Settings → API; Sanity: xoá token; Vercel: tạo lại bypass).

## 6. Production (chỉ sau quyết định GO bằng văn bản)

Xem `docs/RELEASE_PACKET.md`. Tóm tắt: `LEADS_ENABLED` chỉ đặt `true` sau khi chính sách bảo mật + câu đồng ý + thời hạn lưu được duyệt;
khoá Turnstile thật; webhook thứ hai trỏ Deploy Hook của `main`; `PUBLIC_SITE_INDEXING=on` là bước cuối và có thể hoàn tác.
