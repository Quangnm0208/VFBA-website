# Admin Portal (Gate 2) — bằng chứng, 2026-10-23

Phạm vi: một địa chỉ cho Nội dung (Sanity Studio) và Lead (CRM), danh tính Sanity, quyền CRM từ `crm_staff`. Kiến trúc: `docs/ADMIN_PORTAL.vi.md`.

**Kết luận trung thực: CHƯA tuyên bố "một lần đăng nhập đạt" (`PENDING OWNER VERIFICATION`).** Phần từ chối/phân quyền đã có bằng chứng; đường dương (người thật đăng nhập Sanity rồi mở Lead) chỉ Owner làm được (Bước 8f của `docs/OWNER_SETUP_GUIDE.vi.md`). Project Vercel `vbfa-admin` **chưa tồn tại** (kết nối Vercel của agents `403` khi tạo project/đặt biến) nên chưa có URL Preview.

## 1. Thật hay mô phỏng

| Thành phần | Trạng thái |
|---|---|
| Migration `0009` trên Supabase `bzrtllytykldnawbuszu` | **THẬT** — áp dụng version `20261023131207`; dấu vân tay schema trực tiếp = bản dựng từ repo `9dcd0e261d4575384b90c2cf3c5ddf35` (110 hàng) |
| API Sanity `users/me` | **THẬT cho token robot / sai / không có**; **CHƯA quan sát** cho phiên người thật |
| Hàm SQL danh tính (`crm_portal_login/whoami/denied`) | SQL thật trên PGlite (12 test) + đã áp dụng lên Supabase thật |
| Bộ xử lý `/api/portal`, bộ kiểm tra danh tính | Test đơn vị với Sanity mô phỏng (22 + 9 test) |
| Màn hình + bundle Function | Chromium thật, bundle thật, SQL thật, **Sanity mô phỏng**, không có vỏ Studio |
| Hợp đồng chạy trên Vercel (Build Output API, Node listener) | **Chưa kiểm chứng trên Vercel**; chỉ kiểm tra cục bộ (cây output + listener). Sẽ kiểm bằng `run-portal-live` sau khi Owner tạo project |
| Vercel Preview `vbfa-admin` | **Chưa có** (OWNER_ACTION_REQUIRED: Bước 8). Đã thử lúc 2026-10-23 ~13:55 UTC: `create_project` (đủ cấu hình: gốc `studio`, repo, ignore-step, 3 biến không bí mật) → `403 forbidden` (`POST /v11/projects`, requestId `iad1:sfo1::6zrv5-1792763741192-39777fda6457`); `create_git_project` → lỗi lược đồ phản hồi khi tra cứu project liên kết với repo (không phải 403, nhưng không tạo được). Không có CLI/thông tin đăng nhập Vercel trong môi trường của agents |

## 2. Quan sát thật từ API Sanity (probe `scripts/qa/sanity-probe.mjs`, workflow run `39958212710`, job `120429279705`, SHA `fc5257e`)

Chỉ đọc, chỉ in cấu trúc. Token dùng là token robot `SANITY_DEPLOY_TOKEN` của dự án `iqyx5ttc`.

```
project users/me v2021-06-07: HTTP 200      v2025-02-19: HTTP 200 (cùng nội dung)
  keys: email,familyName,givenName,id,name,profileImage,provider,role,roles,sanityUserId
  provider: "sanity-token"   has email: false · has id: true
  role names: developer,editor,contributor,viewer
global users/me: HTTP 200
invalid token: HTTP 401
no token: HTTP 200            <- 200 KHÔNG chứng minh có người dùng; bộ kiểm tra đọc thân phản hồi
list CORS origins: HTTP 200   existing origins: http://localhost:3333 (credentials)
list project users: HTTP 400
```

Hệ quả thiết kế: (1) token robot không có e-mail và có `provider: sanity-token` ⇒ luôn bị từ chối; (2) `200` không đủ; (3) CORS hiện chỉ có `http://localhost:3333`, chưa có origin nào của Vercel — workflow `run-sanity-cors` thêm đúng một origin khi project tồn tại.

## 3. Kiểm thử (tại commit làm việc sau `69b182e`)

| Kiểm thử | Kết quả |
|---|---|
| `npx vitest run` toàn bộ | **227/227** (15 file; trong đó `crm.test.ts` 48, `identity.test.ts` 9, `handler.test.ts` 22) |
| `astro check` (Node 24) | 0 lỗi, 0 cảnh báo (99 file) |
| `studio`: `tsc --noEmit`, `sanity schema validate` | sạch / 0 lỗi, 0 cảnh báo |
| `scripts/qa/portal-browser.mjs` (Chromium, bundle Node listener thật, PGlite, Sanity mô phỏng) | **50/50** — gồm: người ngoài danh sách bị từ chối + ghi nhật ký một lần; token lạ; không token (client không gọi mạng); token robot; số liệu tổng quan khớp DB; phân trang 25/31, lọc, tìm kiếm; đổi trạng thái + từ chối khi cũ (409); ghi chú nhiều dòng, markup hiển thị dạng văn bản; phạm vi (chỉ bản tin) + IDOR 404; Admin/Staff; mời, tắt, đặt lại liên kết, không gỡ được admin cuối; token chỉ trong header `Authorization`; không cookie/storage; no-store/noindex; không cuộn ngang ở 320/375/768/1024/1440; axe-core 0 lỗi ở 6 màn hình; không lỗi console; log chỉ có thao tác/trạng thái/vai trò/thời gian |
| Ảnh chụp | `docs/evidence/portal-screenshots/` (tổng quan, danh sách lead 1280/375, chi tiết, nhân sự 1280/375) — từ harness, không phải từ Studio thật |
| Build "kiểu Vercel": thư mục sao chép chỉ cài `studio/` (không `node_modules` ở gốc), `VERCEL=1`, Node 24, `npm run build` | **đạt** sau 2 sửa (xem §4); `check-vercel-output.mjs` **8/8**: config v3, tra file/function trước SPA fallback, `/api/*` lạ → 404, header bảo mật mọi đường dẫn, không header `Access-Control-*`, cấu hình function Node 22 `Nodejs`, bundle export `default(req,res)`, Studio trong `static/`, **không có** tên khoá service-role / mã dự án Supabase / tên hàm CRM trong bundle trình duyệt |
| Smoke của bundle ở thư mục sao chép (không cấu hình) | `503 not_configured` an toàn (không rơi về nguồn nào khác); thân > 64 KB → `413` |

## 4. Lỗi thật tìm ra khi dựng lại điều kiện Vercel (đã sửa)

1. **esbuild không tìm thấy `@supabase/supabase-js`** khi chỉ cài `studio/` (mã CRM ở `../src` tìm gói lên `node_modules` của thư mục gốc, nơi Vercel không cài). Sửa: `nodePaths: [studio/node_modules]` + gắn `tsconfig` của studio (`studio/scripts/bundle-portal.mjs`).
2. **`sanity build` lỗi `Tsconfig not found astro/tsconfigs/strict`** cũng khi chỉ cài `studio/` (bộ phân giải đi lên `tsconfig.json` gốc cho file `.sanity/runtime` mà tsconfig của studio không bao gồm). Sửa: `studio/tsconfig.json` bao gồm `.sanity/**/*` + `allowJs`.
3. **Function sinh ra trong `api/` lúc build sẽ không được Vercel nhận** (nhận diện function chạy trước lệnh build). Chuyển sang Build Output API (`.vercel/output`); định tuyến/header đặt trong `scripts/build-vercel-output.mjs`.
4. Chú thích mã (`identity.ts`, `identity.test.ts`) từng nói "đã quan sát phiên người thật": sai — đã sửa theo §2.

## 5. Rủi ro chấp nhận / mở

- `npm audit --omit=dev` ở `studio/`: 16 (7 trung bình, 9 cao), **0 gói nào nằm trong bundle của Function** (chỉ `@supabase/*`, `iceberg-js`, `tslib`); toàn bộ là chuỗi công cụ CLI/build của `sanity` (braces, micromatch, fast-glob, globby, chokidar, js-yaml, smol-toml, uuid/typeid-js). Bản sửa hạ `sanity` xuống 5.14.1 (phá vỡ): không làm. Xem lại khi có bản `sanity` mới.
- CSP của Studio ở chế độ Report-Only (script nội tuyến của phần khởi động) — chuyển sang chặn sau khi Owner đăng nhập thật và không thấy vi phạm.
- Token phiên Sanity ở `localStorage` của origin portal (chế độ `token`) — xem `docs/ADMIN_PORTAL.vi.md` §6 P-1; cần Owner chấp nhận.
- Chưa có rate-limit riêng cho `/api/portal` (Owner/WAF).

## 6. Việc còn lại để đóng Gate 2

1. Owner: Bước 8a–8d (tạo `vbfa-admin`, biến, bảo vệ, secret bypass).
2. Agents: `run-sanity-cors` → xác minh deployment (SHA, ID) → `run-portal-live` (kiểm tra thật: bảo vệ, header, định tuyến, 405/401/403/413, token sai & robot hỏi Sanity thật).
3. Owner: Bước 8f (đăng nhập Sanity thật → Quản lý Lead mở được; thử một tài khoản Sanity không có trong `crm_staff` → thấy thông báo từ chối).
4. Chỉ sau 3: ghi "SSO PASS" (hoặc xin Owner chấp thuận ngoại lệ hai phương thức đăng nhập dưới một URL).
