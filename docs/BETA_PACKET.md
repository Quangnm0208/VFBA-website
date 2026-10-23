# Gói Beta VBFA (Beta Evidence Packet)

> **Trạng thái: CHƯA ĐỦ ĐIỀU KIỆN “BETA VERIFIED”.** Ba trong năm tiêu chí thành công đã có bằng chứng THẬT; CRM và Supabase E2E (có CRM) chờ 3 thao tác của Owner (mục 7).
> Không có mục nào dưới đây được ghi PASS nếu chưa có bằng chứng; mỗi dòng ghi rõ **THẬT** (dịch vụ thật) hay **MÔ PHỎNG** (giả lập cục bộ).

## 1. Ba địa chỉ truy cập

| Lối vào | Địa chỉ | Bảo vệ | Trạng thái |
|---|---|---|---|
| **Website Beta** (Preview của nhánh kích hoạt) | `https://vfba-website-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app/` | Vercel Authentication (chỉ thành viên team `quangnm`, hoặc liên kết chia sẻ do Owner tạo); `noindex`; `robots.txt` chặn tất cả | **Hoạt động** (THẬT) |
| **CMS** (Sanity Studio) | https://vbfa-site.sanity.studio | đăng nhập Sanity; chỉ người được Owner mời vào dự án `iqyx5ttc` | **Hoạt động** (THẬT) |
| **CRM Beta** | `<địa chỉ Website Beta>/admin/` | đăng nhập Supabase Auth (chỉ người được mời) + Vercel Authentication | **TẮT** cho đến khi Owner đặt `CRM_ENABLED=true` (Bước 7a); khi tắt trả 404 (THẬT) |

## 2. Danh tính bản phát hành

| Mục | Giá trị |
|---|---|
| Kho mã | `Quangnm0208/VFBA-website`, nhánh `feat/vbfa-services-activation-20261022` (PR #8, draft). **Không** merge vào `main`; PR #6 vẫn draft |
| SHA bản Beta | *(điền khi chốt: SHA của commit cuối cùng đã qua CI và Preview READY)* |
| Deployment Vercel | *(điền: `dpl_…` tương ứng SHA)* |
| Cơ sở dữ liệu | Supabase `bzrtllytykldnawbuszu`, 8 migration, vân tay schema THẬT = bản dựng từ migration `d78e5f73b5d3577c0fd559a9f5856f61` (104 dòng) |
| Production | không đổi: `vfba-website-alpha.vercel.app` → `main@7e8f699` |

## 3. Tài khoản và vai trò Beta (không có mật khẩu trong tài liệu)

| Vai trò | Ai | Quyền | Cách cấp / thu hồi |
|---|---|---|---|
| Người xem website Beta | Owner, người duyệt phía khách | xem Preview | Owner thêm thành viên team Vercel hoặc tạo liên kết chia sẻ |
| Biên tập (Marketing) | do Owner mời | Sanity Studio: tạo/sửa/xuất bản bài, ảnh, SEO, pop-up | Sanity → Manage → Members (`docs/OPERATIONS.md` mục E) |
| CRM **Quản trị** | Owner (tài khoản thật) | quản lý người dùng CRM + xem/sửa khách | `docs/CRM.vi.md` mục 5 |
| CRM **Nhân viên** | do quản trị cấp | xem/sửa khách trong phạm vi | `docs/CRM.vi.md` mục 5.2 |
| Tài khoản kiểm thử tổng hợp (4) | `crm-e2e-admin\|staff\|news\|outsider@vbfa-beta.invalid` | chỉ dùng cho kiểm thử tự động; mật khẩu dẫn xuất từ một secret có sẵn, không lưu ở đâu; `outsider` có tài khoản Auth nhưng **không** nằm trong danh sách cho phép | tạo bằng SQL do kiểm thử in ra; vô hiệu hoá khi hết Beta (`docs/OPERATIONS.md`) |

## 4. Kết quả kiểm thử: thật so với mô phỏng

### THẬT (dịch vụ thật)

| Hạng mục | Kết quả | Tài liệu |
|---|---|---|
| Sanity → webhook → Deploy Hook → Preview: publish, sửa, bỏ xuất bản, xoá, build lỗi giữ bản cũ, phục hồi | **21/21 PASS** (run `39918992928`); cập nhật hiện sau 31 s; bản nháp không bao giờ hiển thị; build lỗi 366 s vẫn phục vụ bản tốt | `docs/evidence/CMS_ACCEPTANCE_2026-10-23.md` |
| Form → Vercel Function → Supabase → SQL readback → dọn dữ liệu | HTTP 24/24, đúng 3 hàng, log không PII, dọn còn 0 hàng (bản `05633ff`; chạy lại cho bản Beta cuối cùng cùng lúc với CRM) | `docs/evidence/E2E_REAL_2026-10-23.md` |
| Cơ sở dữ liệu CRM (migration `0007`, `0008`) | vân tay trùng bản dựng; RLS bật, 0 policy; `anon`/`authenticated` không quyền; 11 hàm chỉ `service_role`; Advisor chỉ INFO | `docs/evidence/CRM_2026-10-23.md` |
| Preview khi CRM tắt | `/admin/*` = 404 với đủ header (`DENY`, CSP, `no-store`, `noindex`) | như trên |
| Cron `vbfa-purge-lead-metadata` | lần chạy đầu thành công 2026-10-23 03:17 UTC | `docs/evidence/SUPABASE_REAL_2026-10-22.md` |

### MÔ PHỎNG (code thật + SQL thật, Auth/PostgREST giả lập cục bộ)

| Bộ kiểm thử | Kết quả |
|---|---|
| `supabase/crm.test.ts` (PGlite) | 36/36 |
| `src/lib/server/crm/app.test.ts` (bộ xử lý trên SQL thật + Auth giả) | 53/53 |
| `scripts/qa/crm-function.mjs` (hàm Vercel đã biên dịch qua HTTP thật) | 56/56 |
| `scripts/qa/crm-browser.mjs` (Chromium: bàn phím, cookie, `Origin` thật, axe-core WCAG 2.2 AA, 8 độ rộng, zoom 400 %) | 37/37 |
| Lighthouse cục bộ cho 4 màn hình CRM (mobile) | hiệu năng 100, trợ năng 100, thực hành tốt 100 (SEO 45: **chủ ý** `noindex`) — xem `docs/QA.md` |

### CHƯA (chờ Owner, Bước 7)

- Đăng nhập, phân quyền, IDOR, đổi trạng thái, ghi chú, đăng xuất thu hồi phiên **trên Preview thật** (`scripts/qa/live-crm-e2e.mjs`).
- Chạy lại E2E biểu mẫu trên bản Beta cuối cùng.
- Quy tắc WAF/rate limit của Vercel (kết nối trả 404; Owner tạo trong giao diện).

## 5. Tóm tắt bảo mật

Không có lỗ hổng Cao/Nghiêm trọng mở trong mã. Một rà soát độc lập (11 phát hiện) đã được xử lý, trong đó một lỗi chức năng P0 (`Referrer-Policy: no-referrer` khiến trình duyệt gửi `Origin: null` và mọi form CRM bị 403) đã được sửa và có kiểm thử trình duyệt chống tái phát. Chi tiết, kèm rủi ro còn lại SEC-C1…C5: `docs/SECURITY_REPORT.md` mục 7.

## 6. Giới hạn đã biết

- CRM Beta: không email mời/quên mật khẩu, không xuất CSV, không phân công; tìm kiếm GET (từ khoá trong URL): `docs/CRM.vi.md` mục 10.
- Nội dung thử: bài `[BETA TEST] Test-123` và tiêu đề trang tin `Test Test` là nội dung giữ chỗ; thay bằng nội dung được duyệt trước khi công khai (CONTENT-001).
- Chưa kiểm thử trên thiết bị thật (iOS Safari, Android Chrome), chưa kiểm thử trình đọc màn hình.
- Chỉ dùng dữ liệu tổng hợp cho đến khi Chính sách bảo mật, câu đồng ý và thời hạn lưu được duyệt (`docs/privacy/`).
- Bản Preview dùng khoá Turnstile **thử** (luôn qua): vì vậy Preview phải được bảo vệ; không công khai.

## 7. Việc cần Owner (gộp một lần)

| # | Việc | Ở đâu | Hướng dẫn |
|---|---|---|---|
| 1 | Thêm 2 biến Vercel cho nhánh Beta: `SUPABASE_PUBLISHABLE_KEY` (khoá công khai), `CRM_ENABLED=true`, rồi Redeploy **Preview** | Vercel → Settings → Environment Variables | `OWNER_SETUP_GUIDE.vi.md` Bước 7a (kết nối Vercel của agents bị `403` khi tạo biến) |
| 2 | Tắt “Allow new users to sign up” | Supabase → Authentication → Sign In / Providers | Bước 7b |
| 3 | Tạo tài khoản quản trị thật + chạy 1 câu SQL cấp quyền | Supabase Auth + SQL Editor | Bước 7c |
| 4 | Quy tắc WAF `/api/*` + `/admin/*` (120 yêu cầu/phút/IP, chặn 1 phút) | Vercel → Firewall | `SECURITY_REPORT.md` SEC-C4 |
| 5 | Branch protection cho `main`; sau Beta: thu hồi/hết hạn token Sanity `SANITY_DEPLOY_TOKEN` | GitHub / Sanity | `SECURITY_REPORT.md` SEC-O4 |
| 6 | Quyết định lưu giữ (khách, ghi chú, nhật ký), chấp nhận tìm kiếm GET, duyệt chính sách bảo mật/câu đồng ý | tài liệu `docs/privacy/` | `RETENTION_PROPOSAL.vi.md` mục 4–5 |

## 8. Rollback

| Tình huống | Cách |
|---|---|
| Tắt CRM ngay | xoá hoặc đổi `CRM_ENABLED` ở Vercel → Redeploy Preview: `/admin/*` trả 404 |
| Website Beta lỗi | Vercel → Deployments → chọn deployment READY trước đó của nhánh → *Promote/Redeploy* (Preview) hoặc `git revert` commit lỗi rồi push; alias nhánh luôn giữ bản READY gần nhất khi build lỗi (đã kiểm chứng THẬT) |
| Nội dung CMS sai | sửa/bỏ xuất bản trong Studio (rebuild ~30 s) hoặc dùng *History* của Sanity |
| Cơ sở dữ liệu | migration `0007`/`0008` chỉ **thêm/thay hàm của CRM**; tắt CRM là đủ. Gỡ hẳn cần migration có phê duyệt (mất ghi chú/nhật ký) |
| Production | không bị đụng; mọi thao tác trên đây chỉ ảnh hưởng Preview |

## 9. Dừng ở đâu

Khi mọi mục “CHƯA” ở mục 4 chuyển thành PASS có bằng chứng: **`BETA VERIFIED — WAITING FOR CLIENT FEEDBACK`**. Không merge vào `main`, không đổi biến Production, không bật chỉ mục, không gắn tên miền cho đến khi Owner GO bằng văn bản.
