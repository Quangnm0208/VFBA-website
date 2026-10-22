# Gói phát hành & báo cáo GO / NO-GO (2026-10-22)

**Quyết định kỹ thuật: NO-GO cho production. READY FOR UAT trên Preview sau khi chủ dự án hoàn tất `docs/ACTIVATION_RUNBOOK.md`.**
Quy tắc phát hành vẫn nguyên: không merge vào `main`, không bật lập chỉ mục, không bật thu thập lead trên production trước khi có quyết định GO bằng văn bản.

Mọi dòng bên dưới ghi rõ **THẬT** (chạy trên dịch vụ thật), **MÔ PHỎNG** (mock/emulator/PGlite) hay **CHƯA** (chưa chạy). Không dòng MÔ PHỎNG nào được dùng làm bằng chứng cho E2E thật.

## 1. URL Sanity Studio và danh sách quyền biên tập

| Mục | Trạng thái |
|---|---|
| Project / dataset | `iqyx5ttc` / `production` (dùng project có sẵn, không tạo mới) |
| Studio build với đúng Project ID | **THẬT** (build cục bộ thành công, `typecheck` + `validate` 0 lỗi; CI dùng ID giả để build) |
| **Studio URL sau deploy** | **CHƯA** — chưa deploy: kỹ sư không có token Sanity và sandbox bị chặn `*.sanity.io`. Có sẵn workflow `Sanity activation (manual)` (chưa chạy lần nào) |
| Danh sách thành viên và vai trò | **CHƯA** — mời thật ở manage.sanity.io; bảng ghi chép mẫu ở runbook mục 2.2 |
| Publish / Unpublish / webhook / nội dung sai | **CHƯA** — kế hoạch nghiệm thu ở runbook mục 2.5. Phần mã đã có test: bộ lọc webhook = 6 loại tài liệu của Studio = các loại site truy vấn; loader Sanity (client giả) fail build khi tài liệu sai hoặc dataset rỗng, tự bổ sung 3 bài nổi bật |

## 2. URL Vercel Preview đúng commit

URL và deployment ID của commit cuối được ghi trong comment của PR #8 và trong báo cáo bàn giao (mỗi commit có một deployment mới; mỗi trang có
`<meta name="vbfa-build" content="<sha>">`). Header bảo mật kiểm bằng kết nối Vercel trên deployment thật: CSP trên `/`, `/tin-tuc/`, 404; HSTS; nosniff; XFO; Referrer-Policy; `/api/*` GET → 405 `Allow: POST`.
Biến môi trường dịch vụ thật **chưa** đặt (xem mục 5) nên Preview hiện chạy bằng nội dung seed và biểu mẫu trả 503 (đúng thiết kế fail-closed).

## 3. Migration, security advisor, E2E API

| Hạng mục | Kết quả | Loại |
|---|---|---|
| 6 migration trên DB `bzrtllytykldnawbuszu`; tên file khớp version remote | 0001-0005 đã áp trước đó; 0006 áp trong đợt này | **THẬT** |
| Schema trên DB = schema do migration trong repo sinh ra (fingerprint 43 dòng) | `95bf69af89bfa4e96e9a78f4f78def2f` hai phía | **THẬT** |
| RLS bật, không policy; `anon`/`authenticated` không đọc/ghi/gọi RPC; `service_role` đủ quyền cần | xác minh bằng `SET ROLE` + bảng quyền | **THẬT** |
| Hành vi DB: throttle 15 lượt, trần 5 lead, trùng bản tin, ràng buộc consent/e-mail/tên, purge giữ hàng lead | giao dịch hoàn tác, DB không còn dữ liệu thử | **THẬT** |
| Security advisor | chỉ 2 INFO `rls_enabled_no_policy` (chủ ý) | **THẬT** |
| Cron `vbfa-purge-lead-metadata` | đã lập lịch, `active`; **chưa chạy lần nào** (lần đầu 2026-10-23 03:17 UTC) | **THẬT** (lịch) / **CHƯA** (chạy) |
| Data API qua HTTP với khoá anon | **CHƯA** (sandbox chặn `*.supabase.co`); lệnh `curl` có sẵn | **CHƯA** |
| Function Vercel ↔ Supabase (`/api/join/`, `/api/newsletter/`) | **CHƯA** — thiếu `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, khoá Turnstile trên Vercel (kết nối của kỹ sư bị 403 khi đọc/ghi biến môi trường) | **CHƯA** |
| Function đã biên dịch với DB giả lập (57 kiểm tra, gồm chính `live-e2e.mjs`) | PASS | **MÔ PHỎNG** |
| Kịch bản E2E thật, an toàn, có SQL xác minh và dọn dẹp | `scripts/qa/live-e2e.mjs` sẵn sàng; chạy theo runbook mục 3 | **CHƯA** |

## 4. Báo cáo kiểm thử

| Kiểm thử | Kết quả | Môi trường |
|---|---|---|
| Type check | 0 lỗi / 0 cảnh báo | CI + cục bộ |
| Unit tests | 71 pass (migration trên PGlite, loader Sanity giả, bộ lọc webhook, validation, handler) | MÔ PHỎNG DB |
| Build + `check_site.py` | pass: tuyến, liên kết, SEO, JSON-LD, chỉ mục tắt, font, CSP từng trang + 404, ngân sách | thật (build) |
| Trình duyệt e2e (API giả) | 117/117, chạy 3 lần liên tiếp ổn định | MÔ PHỎNG API |
| Responsive 9 độ rộng × 4 trang + hộp thoại | không lỗi bố cục/focus (còn 9 báo lỗi `ERR_TUNNEL` là do sandbox chặn script Turnstile, không xảy ra trên CI) | lab |
| Hiệu năng (CDP, slow-4G, 4× CPU, 3 lần) | LCP lạnh 1.1 s (home) / 1.9 s (tin tức) / 1.8 s (bài); CLS ≤ 0.0003 | lab, không phải dữ liệu người dùng thật |
| Lighthouse di động | xem `docs/QA.md` (mục kết quả và dòng "merged head") | lab |
| Bảo mật | quét bí mật: nguồn, bundle client, bundle Function đều sạch; không có sourcemap công khai; phụ thuộc: 3 cảnh báo cao ở chuỗi adapter build-time (không có trong Function), xem QA.md | thật (tĩnh) |
| Trình duyệt thật (iOS Safari, Android Chrome), trình đọc màn hình | **CHƯA** | — |

Lỗi đã tìm thấy và sửa trong đợt này: (1) hộp kiểm đồng ý của bản tin không có vòng focus bàn phím (CI của PR #7 đỏ vì lỗi này; hộp thoại hội viên cũng bị); (2) hộp thoại tự đưa focus về ô đầu sau 60 ms, có thể cướp focus của người đang gõ/tự điền (làm test e2e chập chờn ~50%); (3) comment có ký tự `\n` thật trong `.env.example`/`runtime.ts`; (4) chọn nhầm `home picks` mẫu khi Sanity chưa có trang chủ (đợt trước); (5) migration `0001` bị sửa sau khi đã áp trên DB thật → chuyển phần cấp quyền sang migration `0006`.

## 5. Biến môi trường (chỉ tên; giá trị nằm ở Vercel/GitHub/Sanity)

| Biến | Nơi | Ghi chú |
|---|---|---|
| `PUBLIC_SANITY_PROJECT_ID`, `PUBLIC_SANITY_DATASET`, `PUBLIC_SANITY_API_VERSION` | Vercel (Preview theo nhánh → Production sau GO) | công khai |
| `SANITY_API_READ_TOKEN` | Vercel | chỉ khi dataset private |
| `SUPABASE_URL` | Vercel | công khai |
| `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY` | Vercel (Sensitive) | bí mật |
| `PUBLIC_TURNSTILE_SITE_KEY` | Vercel | đọc lúc build |
| `LEADS_ENABLED` | Vercel | `true` chỉ trên Preview thử; **Production giữ không đặt/false** |
| `PUBLIC_SITE_INDEXING`, `PUBLIC_SITE_URL`, `FORM_ALLOWED_ORIGINS`, `ENABLE_VERCEL_ANALYTICS` | Vercel | xem `docs/OPERATIONS.md` |
| `SANITY_DEPLOY_TOKEN`, `SANITY_IMPORT_TOKEN`, `VERCEL_PROTECTION_BYPASS` | GitHub Secrets | bí mật; xoá sau khi dùng |
| `SANITY_STUDIO_PROJECT_ID`, `SANITY_STUDIO_DATASET`, `SANITY_STUDIO_HOST` | build Studio | công khai |

## 6. PR, commit cuối, CI

PR #8 (`feat/vbfa-services-activation-20261022` → `claude/eloquent-meitner-pn6u2b`) mang theo toàn bộ nội dung của PR #7 (đã merge vào nhánh này, kèm sửa lỗi),
nên PR #7 có thể đóng sau khi PR #8 được duyệt. PR #6 là bản phát hành gốc (draft, chưa merge). SHA và trạng thái CI cuối: xem comment của PR #8.

## 7. P0 / P1 còn mở

| Mức | Việc | Chủ |
|---|---|---|
| P0 | Chính sách bảo mật + câu đồng ý (hội viên, bản tin) + thời hạn lưu hàng lead + xác nhận bên xử lý/chuyển dữ liệu: chưa duyệt | Pháp lý / chủ dự án |
| P0 | Font SVN-Bebas Neue Pro / SVN-Primark còn trong lịch sử Git công khai và trong deployment production hiện tại: cần giấy phép hoặc cho phép rollback + làm sạch lịch sử | Chủ dự án |
| P0 | E2E thật Function ↔ Supabase ↔ Turnstile chưa chạy | Chủ dự án đặt biến (runbook mục 1) rồi chạy mục 3 |
| P0 | Studio chưa deploy, chưa mời Marketing, chưa import, chưa có webhook | Admin Sanity (runbook mục 2) |
| P0 | Bài 4-10 và ngày xuất bản là mẫu; ảnh chưa rõ nguồn/bản quyền; thông tin liên hệ trống | Marketing |
| P1 | WAF rate-limit `/api/*` chưa cấu hình (kết nối của kỹ sư không tạo được) | Chủ dự án (runbook mục 4) |
| P1 | Câu đồng ý bản tin đang viết cứng trong mã (cần CMS hoá sau khi pháp lý duyệt chữ) | Kỹ sư sau khi có chữ duyệt |
| P1 | Cron purge chưa chạy lần nào; đối chiếu `cron.job_run_details` sau 2026-10-23 03:17 UTC | Kỹ sư/Chủ dự án |
| P1 | Độ trễ Function `sin1` ↔ Supabase Seoul chưa đo | sau E2E thật |
| P1 | Đăng bài hẹn giờ cần build lại (site tĩnh) | quyết định có làm bộ hẹn giờ không |
| P1 | Thử trên thiết bị thật + trình đọc màn hình | UAT |
| P2 | Cảnh báo phụ thuộc build-time (`path-to-regexp`), Studio toolchain | theo dõi upstream |

## 8. Rollback và danh sách kiểm tra phát hành

- **Rollback production**: Vercel → Deployments → `dpl_CDVBZ7DAt2h1z91gM66j6SuPZxUX` (`main@9e6be54`) → Promote/Instant Rollback. Deployment production hiện tại là `dpl_9jxuNcjYNQcn9kdTXCZfqX5WcXnG` (`f9ef1c0`). Xác minh lại cả hai còn ở trạng thái rollback-candidate ngay trước khi dùng.
- **Rollback dữ liệu/DB**: migration chỉ thêm; không có bước xoá. Dừng thu thập lead bằng cách đặt `LEADS_ENABLED` về `false` (có hiệu lực ở lần deploy kế tiếp) — hoặc thu hồi khoá service_role trong Supabase để chặn ngay lập tức.
- **Rollback nội dung**: Sanity có lịch sử bản; Unpublish hoặc khôi phục bản trước rồi Publish (webhook tự build).
- **Checklist GO** (tất cả phải đạt, kèm bằng chứng): mọi P0 ở mục 7 đóng · CI xanh trên đúng SHA · Preview đúng SHA · E2E thật PASS (HTTP + SQL) · Data API anon bị từ chối (HTTP) · WAF đã bật và thử · log không có dữ liệu cá nhân · trang Chính sách bảo mật đã xuất bản và được liên kết · khoá Turnstile thật + hostname · Deploy Hook của `main` chỉ tạo sau GO · quyết định chỉ mục · người duyệt ký.
- **Sau phát hành**: `SMOKE_BASE_URL=<host> SMOKE_EXPECT_SHA=<sha> node scripts/qa/smoke.mjs`; Lighthouse di động; theo dõi log `lead.*` 24 giờ đầu; đối chiếu cron; giữ chỉ mục tắt tới khi chủ dự án quyết định.

## 9. Bản ghi phê duyệt

| Trường | Giá trị |
|---|---|
| Người duyệt (CTO) | CHƯA |
| SHA được duyệt | CHƯA |
| Quyết định | **NO-GO** (xem mục 7) |
| Ngày/giờ | — |
