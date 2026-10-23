# Gói phát hành VBFA và bản ghi GO / NO-GO (cập nhật 2026-10-23)

**Trạng thái hiện tại**

| Mốc | Quyết định kỹ thuật |
|---|---|
| **Release A** — website công khai + Sanity CMS (`LEADS_ENABLED` không bật, chỉ mục tắt) | **SẴN SÀNG CHỜ OWNER GO** — còn các điều kiện A-1…A-6 ở mục 7 (đều là việc của Owner/Marketing; không có blocker kỹ thuật mở) |
| **Release B** — backend đầy đủ (nhận lead thật) | **NO-GO** — E2E thật chưa chạy, chưa có phê duyệt pháp lý, WAF chưa bật, chưa có khoá Turnstile thật, chưa chốt domain (mục 8) |

Quy tắc an toàn vẫn nguyên: **không** merge PR #6 vào `main`, không promote deployment, không đổi biến Production, không bật form thật, không đổi domain khi chưa có Owner GO bằng văn bản.

Nhãn bằng chứng: **THẬT** = chạy/quan sát trên dịch vụ thật · **MÔ PHỎNG** = mock, emulator, PGlite · **TĨNH** = đọc mã/cấu hình · **CHƯA** = chưa làm. Không dòng MÔ PHỎNG nào được dùng để tuyên bố E2E thật đã PASS.

## 1. Chỉ mục bằng chứng

| Hạng mục | Giá trị |
|---|---|
| Repo | `Quangnm0208/VFBA-website` |
| PR | #10 (`fix/vbfa-preview-one-article` → activation) **đã merge** vào `feat/vbfa-services-activation-20261022` (merge commit `b90019c`); #8 (activation → `claude/eloquent-meitner-pn6u2b`) mở; #6 (→ `main`) draft, **chưa merge** |
| Commit đợt này | `f70b3f1` bài không ảnh bìa không làm hỏng build · `eaf9baf` ẩn khối rỗng khi chỉ có 1 bài · `56f5c60` build Production thiếu CMS bị từ chối + ghim Studio · `edba4bc` bộ kiểm tra lịch xuất bản (ngủ) · `0f8d102` gửi quá nhanh ⇒ `429` thật thay vì `200` giả · `7f33afa` chuẩn hoá câu đồng ý · `3ba960e` tài liệu quyền riêng tư |
| CI (GitHub Actions, workflow `CI`) | xanh (push + pull_request) tại `f70b3f1` (run 72), `eaf9baf` (run 74), `edba4bc` (runs 77, 78). Các commit sau: xem comment PR #8 |
| Preview Vercel (không phải Production) | `dpl_DtKHnUzt6AgMN749gNReTqrzwTDy` (`f70b3f1`), `dpl_HKjRQFhqV253KZvM5MtJt8y4z1Xq` (`eaf9baf`), `dpl_9xc7QyoJdnxj8ELtowVc1nZ8wUM1` (`56f5c60`), `dpl_51oPHxAM7S3xYmu4w4P1ptCMJEur` (`edba4bc`), tất cả READY; bí danh nhánh `vfba-website-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app` (Vercel Authentication bật); mỗi trang có `<meta name="vbfa-build" content="<sha>">` |
| Studio | `https://vbfa-site.sanity.studio/`, triển khai lại ngày 2026-10-22 15:45 UTC, workflow `VBFA Sanity Studio deployment` run `39807604001` (typecheck, `sanity schema validate` 0 lỗi/0 cảnh báo, build, `Deployed 1/1 schemas`) |
| Supabase | dự án `bzrtllytykldnawbuszu`; vân tay schema `95bf69af89bfa4e96e9a78f4f78def2f` (43 dòng) = bản dựng từ 6 migration |
| Production hiện tại | `dpl_9jxuNcjYNQcn9kdTXCZfqX5WcXnG` (`f9ef1c0`, frontend cũ) — **không đụng tới** |
| Tài liệu bằng chứng | `docs/evidence/E2E_REAL_2026-10-23.md`, `docs/evidence/CMS_PREVIEW_2026-10-22.md`, `docs/evidence/SUPABASE_REAL_2026-10-22.md`, `docs/SECURITY_REPORT.md`, `docs/QA.md` |

## 2. Gói phát hành (15 hạng mục)

| # | Hạng mục | Vị trí | Trạng thái |
|---|---|---|---|
| 1 | Frontend Astro | `src/`, `astro.config.ts`, `vercel.json` | THẬT: Preview READY đọc Sanity thật |
| 2 | Sanity Studio + schema | `studio/` (6 loại tài liệu) | THẬT: đã deploy; audit mục 4 của `CMS_PREVIEW_2026-10-22.md` |
| 3 | Migration Supabase | `supabase/migrations/` (6 file, version khớp remote) | THẬT: không cần áp thêm cho Release A/B |
| 4 | Vercel Functions | `src/pages/api/join.ts`, `newsletter.ts` → `src/lib/server/` | MÔ PHỎNG (58 kiểm tra trên Function biên dịch) · THẬT chưa chạy (mục 5) |
| 5 | Ma trận biến môi trường | mục 3 | — |
| 6 | CI/CD | `.github/workflows/`: `ci.yml`, `live-smoke.yml`, `sanity-activate.yml`, `scheduled-publish.yml` (ngủ); trên `main` (đã có): `vbfa-sanity-deploy.yml`, `vbfa-preview-e2e.yml` | THẬT (CI, Studio) |
| 7 | Cấu hình webhook | `docs/OPERATIONS.md` D và E, `docs/ACTIVATION_RUNBOOK.md` 2.4; bộ lọc có test | **CHƯA** tạo (OWNER_ACTION mục 6) |
| 8 | Báo cáo bảo mật | `docs/SECURITY_REPORT.md` | xong (mục mở: WAF, E2E thật, branch protection) |
| 9 | Báo cáo E2E | mục 5 | thật: **chưa chạy** |
| 10 | Lighthouse / trợ năng | `docs/QA.md` (đo trên bản dựng cục bộ cùng mã, HTTP/2 + Brotli); mục 5 | lab; Preview thật: kiểm tra HTTP có, trình duyệt **CHƯA** |
| 11 | Kiểm kê nội dung | mục 4 | xong |
| 12 | Quyền riêng tư / đồng ý | `docs/privacy/` | bản nháp, **CHƯA được duyệt** |
| 13 | Kế hoạch triển khai | mục 7 (A) và 8 (B) | xong |
| 14 | Kế hoạch rollback | mục 9 | xong |
| 15 | Bản ghi GO/NO-GO | mục 10 | chờ Owner |

## 3. Ma trận biến môi trường (chỉ tên, giá trị nằm ở Vercel/GitHub/Sanity)

| Biến | Preview (nhánh activation) | Production — Release A | Production — Release B | Bí mật |
|---|---|---|---|---|
| `PUBLIC_SANITY_PROJECT_ID` = `iqyx5ttc` | đặt (Owner xác nhận đã đặt; kết nối kỹ sư không đọc được) | **đặt** (bắt buộc: thiếu ⇒ build Production bị từ chối) | đặt | không |
| `PUBLIC_SANITY_DATASET` = `production`, `PUBLIC_SANITY_API_VERSION` = `2026-10-01` | đặt | đặt | đặt | không |
| `PUBLIC_SITE_INDEXING` | `off` | `off` (chỉ bật khi Owner cho phép) | `off` → `on` theo quyết định Owner | không |
| `PUBLIC_SITE_URL` | trống | trống tới khi có domain | domain chính thức | không |
| `LEADS_ENABLED` | `false`; `true` **chỉ** trong lúc chạy E2E rồi trả về `false` | **không đặt / `false`** | `true` (bước cuối cùng) | không |
| `SUPABASE_URL` | khi E2E | không cần | đặt | không |
| `SUPABASE_SERVICE_ROLE_KEY` | khi E2E (Sensitive) | **không đặt** | đặt (Sensitive) | **có** |
| `IP_HASH_SALT` (`openssl rand -hex 32`) | khi E2E | không đặt | đặt, giá trị riêng cho Production | **có** |
| `PUBLIC_TURNSTILE_SITE_KEY` | khoá thử `1x00000000000000000000AA` (công khai) khi E2E | không đặt | khoá thật; đọc lúc build ⇒ redeploy | không |
| `TURNSTILE_SECRET_KEY` | khoá thử `1x0000000000000000000000000000000AA` khi E2E | không đặt | khoá thật | **có** |
| `FORM_ALLOWED_ORIGINS` | trống | trống | domain thứ hai nếu có | không |
| `SANITY_API_READ_TOKEN` | không cần (dataset công khai) | không cần | không cần | có (nếu dataset chuyển private) |
| `ENABLE_VERCEL_ANALYTICS` | `false` | `false` | theo quyết định (cập nhật chính sách bảo mật nếu bật) | không |
| GitHub: `SANITY_DEPLOY_TOKEN` (môi trường `vbfa-cms`) | — | — | — | **có** (đã đặt, đã dùng) |
| GitHub: `VERCEL_PROTECTION_BYPASS` | cần cho E2E (chưa biết có chưa) | — | — | **có** |
| GitHub: `VERCEL_DEPLOY_HOOK_URL` + biến `SCHEDULED_PUBLISH_*` | — | tuỳ chọn (bộ kiểm tra lịch) | tuỳ chọn | **có** |

Bảo vệ: khoá Turnstile thử luôn trả "pass" ⇒ **không bao giờ** đặt ở Production; workflow E2E tự dừng nếu Preview không yêu cầu đăng nhập.

## 4. Kiểm kê nội dung

| Nội dung | Nguồn | Trạng thái | Việc cần làm |
|---|---|---|---|
| Bài `Test-123` (slug `test`) | Sanity (THẬT, quan sát trên Preview) | **Giữ chỗ**: tóm tắt "Testttt…", thân "test", nhãn "test", không có ảnh bìa (site dùng ảnh thương hiệu mặc định) | Marketing thay bằng bài thật hoặc Unpublish trước Release A |
| Trang Tin tức (singleton `newsPage`) | Sanity (THẬT) | **Giữ chỗ**: nhãn "Test", tiêu đề "Test Test", mô tả "Test" | Marketing điền nội dung thật |
| Trang chủ (`homePage`), Thông tin chung (`siteSettings`), trang tĩnh, pop-up | Sanity | **Không quan sát được** đã Publish hay chưa. Nội dung hiển thị hiện là mặc định trong repo ("Kết nối nguồn lực. Kiến tạo tương lai năng lượng xanh." và các khối Về VBFA / Lĩnh vực / Hội viên / Thư viện) | Marketing xác nhận và Publish bản được duyệt; Owner duyệt chữ |
| 6 bài mẫu trong seed (`dong-luc-tuong-lai`, `chuoi-gia-tri`, `cong-nghe-doi-moi`, `hop-tac-quoc-te`, `khong-gian-doi-thoai`, `noi-dung-chinh-sach`) | `src/lib/content/seed/` | Chỉ dùng khi **không** cấu hình Sanity (dev/Preview). Build Production không thể dùng chúng (BUG-003) | Không cần làm; không import vào dataset thật |
| Trang Chính sách bảo mật | chưa có | bản nháp ở `docs/privacy/PRIVACY_POLICY_DRAFT.vi.md`, **chưa duyệt** | Owner/pháp lý → Marketing tạo trang → chọn trong Studio |
| Liên hệ chính thức (email, điện thoại, địa chỉ) | `siteSettings.contact` | **Trống** | Owner cung cấp |
| Ảnh | ảnh thương hiệu trong repo; bài chưa có ảnh bìa | nguồn gốc/bản quyền ảnh thương hiệu cần Owner xác nhận | Owner |
| Font | OFL (Mona Sans, Be Vietnam Pro, Barlow Condensed, Dancing Script) trong mã mới; font SVN còn trong lịch sử Git công khai và deployment Production hiện tại | **P0 giấy phép** (không thuộc mã mới) | Owner quyết định (giấy phép hoặc làm sạch lịch sử) |

## 5. Báo cáo E2E, Lighthouse, trợ năng

**E2E thật Function ↔ Turnstile (khoá thử) ↔ Supabase: ĐÃ CHẠY 2026-10-23** sau khi Owner đặt biến Preview và secret `VERCEL_PROTECTION_BYPASS`: workflow `VBFA Preview real-service E2E` run `39911745667` trên deployment `dpl_DxkZ7gb6MdHzRhGcyWaQS8wVvZTh` (`05633ff`): **HTTP 24/24**; **SQL thật đúng 3 hàng** (`join-v2`, `newsletter-v1` x2, `ip_hash` 32 ký tự), 0 hàng cho các kịch bản không được lưu; **log Vercel có sự kiện `lead.*` và không có email/tên**. **Dọn dẹp còn mở**: lệnh `DELETE` qua kết nối bị treo (chờ xác nhận), 3 hàng thử vẫn còn cho tới khi Owner chạy câu lệnh xoá (`docs/evidence/E2E_REAL_2026-10-23.md` mục 5). Chưa chứng minh: khoá Turnstile thật và luồng trình duyệt thật.

| Kiểm thử | Kết quả | Loại |
|---|---|---|
| Type check / build / `check_site.py` | 0 lỗi; 13 trang, 12 URL sitemap, chỉ mục tắt; CSP từng trang + 404 | CI + cục bộ |
| Unit test | 95 pass (handler, validation, đồng ý, log, loader Sanity giả, chính sách nguồn nội dung, bộ lọc webhook, migration trên PGlite, bộ kiểm tra lịch xuất bản) | MÔ PHỎNG DB/Sanity |
| Function biên dịch (gồm chính `live-e2e.mjs`) | 58/58 | MÔ PHỎNG DB |
| Trình duyệt e2e (API giả) | 111/111 (bản dựng không pop-up; bản có pop-up thêm ca) | MÔ PHỎNG API |
| Responsive 320…1920 | không lỗi bố cục/focus (báo `ERR_TUNNEL` do sandbox chặn script Turnstile) | lab |
| Lighthouse di động (trung vị, HTTP/2 + Brotli) | `/` 97 · `/tin-tuc/` 99 · bài 98; Accessibility 100; Best practices 100; LCP 2.42/2.21/2.28 s; CLS ≤ 0.0003 | lab, bản dựng cục bộ cùng mã |
| Lighthouse máy tính để bàn (trung vị 3, preset desktop, HTTP/2 + Brotli) | `/`, `/tin-tuc/`, bài viết: Performance 100 · Accessibility 100 · Best practices 100 · LCP 0.49–0.53 s · CLS 0.0001 · TBT 0 ms (tìm ra và sửa BUG-006 ảnh trang trí; xem `docs/QA.md`) | lab, bản dựng cục bộ cùng mã |
| Preview thật: HTTP | `/`, `/tin-tuc/`, `/tin-tuc/test/` 200 và hiển thị bài Sanity; 404 có CSP; `/robots.txt`, `/sitemap.xml` (3 URL), `/search-index.json` (1 bài); `GET /api/join/` 405 `Allow: POST` `no-store`; tệp băm `/_astro/*` có `immutable`, nén Brotli; `noindex` ở mọi phản hồi | **THẬT** |
| Preview thật: trình duyệt (Lighthouse, trợ năng, responsive, e2e) | **CHƯA** — sandbox không tới được `*.vercel.app`; cần secret bypass để chạy từ GitHub Actions | CHƯA |
| Thiết bị thật (iOS Safari, Android Chrome), trình đọc màn hình | **CHƯA** | — |
| INP / dữ liệu người dùng thật | không có (chưa có lưu lượng thật) | — |

## 6. Việc cần Owner (OWNER_ACTION_REQUIRED) — ngắn gọn, theo thứ tự

> Hướng dẫn bấm-từng-bước, kèm bảng biến môi trường và mẫu văn bản xác nhận phạm vi Beta: **`docs/OWNER_SETUP_GUIDE.vi.md`**.

1. **Deploy Hook cho nhánh activation** (kết nối Vercel không có công cụ tạo): Vercel → project `vfba-website` → Settings → Git → Deploy Hooks → tên `sanity-preview`, nhánh `feat/vbfa-services-activation-20261022` → sao chép URL (bí mật).
2. **Webhook Sanity** (kỹ sư không có token quản trị, sandbox chặn `*.sanity.io`): manage.sanity.io → project `iqyx5ttc` → API → Webhooks → Create: dataset `production`; URL = Deploy Hook ở bước 1; trigger Create/Update/Delete; **tắt** "Include drafts"; Filter `_type in ["article","page","homePage","newsPage","siteSettings","popup"]`; POST. Sau đó báo kỹ sư để chạy nghiệm thu (`docs/OPERATIONS.md` mục E): Publish bài mới → Edit → Unpublish → Delete; ở mỗi bước kỹ sư đối chiếu deployment mới do deploy hook tạo (không kèm commit mới) và nội dung trang trên Preview; lượt gọi webhook xem ở manage.sanity.io → API → Webhooks → Attempts.
3. **Biến Preview cho E2E** (Vercel → Settings → Environment Variables → chỉ môi trường Preview, nhánh `feat/vbfa-services-activation-20261022`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Sensitive), `IP_HASH_SALT`, `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`, `LEADS_ENABLED=true`. Đồng thời xác nhận `PUBLIC_SANITY_PROJECT_ID`, `PUBLIC_SANITY_DATASET`, `PUBLIC_SANITY_API_VERSION`, `PUBLIC_SITE_INDEXING=off` đã đặt. (Hoặc cấp cho kết nối Vercel quyền đọc/ghi biến môi trường để kỹ sư tự xác minh.)
4. **Secret GitHub `VERCEL_PROTECTION_BYPASS`**: Vercel → Settings → Deployment Protection → Protection Bypass for Automation → tạo → dán vào GitHub → Settings → Secrets and variables → Actions.
5. **WAF**: Vercel → Firewall → Add rule: đường dẫn bắt đầu bằng `/api/` · giới hạn cố định 60 s · 30 yêu cầu · khoá theo IP · hành động 429 · phạt 10 phút (chi tiết `docs/ACTIVATION_RUNBOOK.md` mục 4).
6. **Branch protection** cho `main` (yêu cầu PR + CI xanh, cấm force-push) và bảo vệ GitHub Environment `vbfa-cms` (người duyệt bắt buộc).
7. Sau 3 và 4 xong, kỹ sư: push một commit để Vercel build lại với biến mới → chạy `VBFA Preview real-service E2E` (URL = bí danh nhánh, `confirmation = write-test-rows`) → đối chiếu **SQL thật** (đúng 3 hàng `e2e-…`) → xoá hàng thử → xác nhận `count = 0` → kiểm tra `get_runtime_logs` không chứa email thử → đặt `LEADS_ENABLED` về `false`.

## 7. Release A — website + CMS (kế hoạch triển khai; chỉ thực hiện sau Owner GO)

Điều kiện của Owner/Marketing:

| Mã | Điều kiện | Trạng thái |
|---|---|---|
| A-1 | Thay nội dung giữ chỗ (`Test-123`, trang Tin tức "Test") bằng nội dung thật hoặc Unpublish | chờ Marketing |
| A-2 | Duyệt nội dung công khai (trang chủ, thông tin chung, liên hệ chính thức) | chờ Owner |
| A-3 | Quyết định font SVN (giấy phép hoặc làm sạch lịch sử Git) | chờ Owner |
| A-4 | Quyết định cách xử lý biểu mẫu khi chưa nhận dữ liệu: **(a)** giữ nguyên — nút "Trở thành hội viên" và dải bản tin vẫn mở form, nhưng mọi lượt gửi nhận lỗi trung thực "Chưa thể gửi lúc này…" (503, không lưu); **(b)** thêm một thay đổi nhỏ để hộp thoại hiện "đang chuẩn bị mở" thay vì form (cần một cờ build-time mới, kỹ sư làm). Khuyến nghị (b) nếu Release A kéo dài quá vài ngày | chờ Owner |
| A-5 | Domain và chỉ mục: Release A chạy trên `vfba-website-alpha.vercel.app`, `PUBLIC_SITE_INDEXING=off` | quyết định Owner |
| A-6 | Webhook (mục 6.1–6.2) và nghiệm thu publish/unpublish đã PASS trên Preview | chờ Owner + kỹ sư |

Các bước (kỹ sư thực hiện sau GO; mỗi bước ghi SHA/ID deployment):

1. Cập nhật PR #8 và merge nhánh theo thứ tự đã duyệt: activation → `claude/eloquent-meitner-pn6u2b` (PR #8) → `main` (PR #6). **Chỉ sau GO.**
2. Trước khi merge vào `main`: đặt biến Production theo cột "Release A" (mục 3). Thiếu `PUBLIC_SANITY_PROJECT_ID`, build Production sẽ **bị từ chối** (bảo vệ có chủ ý) và deployment cũ vẫn chạy.
3. Vercel tự deploy `main` lên Production. Xác minh: `SMOKE_BASE_URL=<host> SMOKE_EXPECT_SHA=<sha> node scripts/qa/smoke.mjs`; mở `/`, `/tin-tuc/`, một bài; `noindex` còn nguyên; Lighthouse di động và máy tính.
4. Tạo Deploy Hook riêng cho `main` + webhook Sanity thứ hai trỏ vào đó (không dùng hook Preview cho Production); nghiệm thu một lần Publish/Unpublish.
5. (Tuỳ chọn) bật bộ kiểm tra lịch xuất bản: biến `SCHEDULED_PUBLISH_ENABLED=true`, `SCHEDULED_PUBLISH_SITE_URL`, secret `VERCEL_DEPLOY_HOOK_URL`.
6. Ghi kết quả vào mục 10.

## 8. Release B — backend đầy đủ (điều kiện; **NO-GO hiện tại**)

| Mã | Điều kiện | Trạng thái |
|---|---|---|
| B-1 | Chính sách bảo mật + hai câu đồng ý + thời hạn lưu + danh sách bên xử lý/chuyển dữ liệu **được duyệt bằng văn bản** (`docs/privacy/`) | chưa |
| B-2 | Trang Chính sách bảo mật đã Publish và được chọn trong Studio (cả hai ô tích có liên kết) | chưa |
| B-3 | E2E thật PASS: HTTP + SQL thật, đúng 3 hàng, đã xoá, log không có PII (mục 6.7) | **gần đạt**: HTTP 24/24, SQL đúng 3 hàng, log không PII (THẬT, 2026-10-23); còn **xoá 3 hàng thử và xác nhận count = 0** |
| B-4 | Data API từ chối khoá anon (HTTP) | chưa |
| B-5 | WAF `/api/*` đã bật và đã thử | chưa |
| B-6 | Khoá Turnstile thật (+ hostname domain chính thức) | chưa |
| B-7 | Quy trình xoá dữ liệu theo yêu cầu được thử; thời hạn lưu được duyệt (và nếu có lịch xoá hàng lead thì migration `0007` đã được duyệt riêng) | chưa |
| B-8 | Cron `vbfa-purge-lead-metadata` đã chạy ít nhất một lần thành công (`cron.job_run_details`) | **ĐẠT**: `runid 1` succeeded 2026-10-23 03:17:00 UTC (THẬT) |
| B-10 | Lead Inbox (CRM tối thiểu có đăng nhập) theo `docs/BETA_FIRST_OWNER_AGENT_PLAYBOOK.md` mục 3: hiện **chưa có** — `website_leads` mới chỉ là bảng dữ liệu. Cần Owner đồng ý các thay đổi DB (3 bảng mới có RLS, không cấp quyền cho `anon`/`authenticated`) rồi agents xây | chưa xây; chờ đồng ý ở Bước 6 của `OWNER_SETUP_GUIDE.vi.md` |
| B-9 | Domain + SSL + smoke API trên domain chính thức; `PUBLIC_SITE_URL`, `FORM_ALLOWED_ORIGINS`, hostname Turnstile cập nhật | chưa |

Trình tự bật: đặt biến Production bí mật → khoá Turnstile thật → `LEADS_ENABLED=true` **cuối cùng** → redeploy → Owner gửi một bản ghi thử có kiểm soát (E2E tự động từ chối host Production) → xoá theo `DATA_SUBJECT_REQUESTS.vi.md` → theo dõi log `lead.*` 24 giờ (tỉ lệ `lead.dropped` / `lead.stored`, `503`, `429`).

## 9. Rollback

- **Mã/trang (Release A hoặc B)**: Vercel → Deployments → deployment Production liền trước (`dpl_9jxuNcjYNQcn9kdTXCZfqX5WcXnG`, `f9ef1c0`; cũ hơn: `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX`, `main@9e6be54`) → Promote/Instant Rollback. Kiểm tra lại hai deployment này còn là ứng viên rollback ngay trước khi dùng.
- **Dừng nhận lead tức thì**: đặt `LEADS_ENABLED=false` (hiệu lực ở lần deploy kế) hoặc thu hồi khoá `service_role` trong Supabase (hiệu lực ngay; form trả 503, không mất dữ liệu đã lưu).
- **Nội dung**: Sanity có lịch sử bản; khôi phục bản trước hoặc Unpublish rồi Publish (webhook tự build). Một build lỗi do nội dung sai **không** thay thế deployment đang chạy.
- **Dữ liệu/DB**: migration chỉ thêm. Lịch xoá hàng lead (0007), nếu được duyệt, chạy dry-run trước; dữ liệu đã xoá chỉ khôi phục từ sao lưu của nhà cung cấp.
- **Webhook gây build liên tục**: tắt webhook trong manage.sanity.io hoặc xoá Deploy Hook (URL cũ chết ngay).

## 10. Bản ghi phê duyệt

| Trường | Release A | Release B |
|---|---|---|
| Quyết định kỹ thuật | SẴN SÀNG CHỜ OWNER GO (điều kiện A-1…A-6) | NO-GO (điều kiện B-1…B-9) |
| SHA được duyệt | CHƯA (ghi head nhánh `feat/vbfa-services-activation-20261022` tại thời điểm duyệt) | CHƯA |
| Người duyệt (Owner) | CHƯA | CHƯA |
| Ngày/giờ | — | — |
| Ghi chú | | |
