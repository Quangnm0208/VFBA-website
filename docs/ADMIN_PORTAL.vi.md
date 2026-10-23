# VBFA Admin Portal — một địa chỉ cho Nội dung (CMS) và Lead (CRM)

Trạng thái: **Beta, chờ Owner nghiệm thu đường đăng nhập thật** (xem §7). Tài liệu này mô tả kiến trúc, mô hình xác thực, cách triển khai và những gì **đã** / **chưa** được chứng minh bằng dịch vụ thật. Bằng chứng chi tiết: `docs/evidence/ADMIN_PORTAL_2026-10-23.md`.

## 1. Người dùng thấy gì

Một địa chỉ (Vercel project `vbfa-admin`), một lần đăng nhập Sanity, bốn mục trên thanh điều hướng:

| Mục | Dành cho | Nội dung |
|---|---|---|
| **Tổng quan** | mọi thành viên | số lead mới / đang xử lý (chỉ trong phạm vi của người đó), lối vào Nội dung và Lead |
| **Quản trị nội dung** | thành viên dự án Sanity | trang chủ, tin tức, trang nội dung, SEO, popup, thông tin chung (Sanity Studio, không đổi schema) |
| **Quản lý Lead** | người có trong danh sách nhân sự CRM | hộp thư lead: lọc theo loại / trạng thái / ngày, tìm kiếm, phân trang 25 dòng, chi tiết kèm bằng chứng đồng ý, đổi trạng thái, ghi chú |
| **Quản trị nhân sự** | chỉ vai trò Admin CRM | mời nhân viên, đặt vai trò và phạm vi loại lead, tắt/bật, đặt lại liên kết đăng nhập |

Công cụ truy vấn (Vision) chỉ hiện cho vai trò `administrator`/`developer` của Sanity.

## 2. Kiến trúc

```
Trình duyệt ── https://vbfa-admin-….vercel.app ───────────────────────────────┐
   │   (Vercel Authentication bảo vệ bản Preview)                             │
   │                                                                          │
   ├─ Studio (tĩnh, bundle của chúng ta)                                      │
   │     Nội dung ──────────────► Sanity Content Lake (CORS: đúng origin này) │
   │     Lead / Nhân sự ─ POST /api/portal ─┐                                 │
   │        Authorization: Bearer <token phiên Sanity của chính người đó>     │
   │                                         ▼                                │
   │                     Vercel Function (Node, sin1) ────────────────────────┘
   │                       1. hỏi Sanity: GET /users/me với token đó  ─► ai là chủ token?
   │                       2. tra danh sách nhân sự (crm_staff) bằng Supabase service-role ─► có quyền không?
   │                       3. gọi hàm SQL SECURITY DEFINER (kiểm tra lại actor + phạm vi)
   │                       4. ghi nhật ký kiểm toán (crm_audit)
   └─ Website công khai (dự án khác `vfba-website`) vẫn chạy CRM cũ ở /admin/ (Supabase Auth) — chưa gỡ
```

- **Không tạo dự án Sanity/Supabase mới, không dịch vụ trả phí mới.** Cùng Content Lake `iqyx5ttc/production`, cùng cơ sở dữ liệu `bzrtllytykldnawbuszu`, cùng logic CRM (`src/lib/server/crm`).
- Mã Studio ở `studio/`; màn hình Lead/Nhân sự ở `studio/portal/*`; Function ở `studio/portal-api/portal.ts`; logic dùng chung ở `src/lib/server/crm/portal/*` (34 test đơn vị).
- **Build** (`npm run build` trong `studio/`) = `sanity build` + `scripts/build-vercel-output.mjs`, tạo cây **Build Output API v3** (`.vercel/output`: `static/` + `functions/api/portal.func` + `config.json`). Lý do không dùng thư mục `api/`: Vercel nhận diện function trong mã nguồn **trước** khi chạy lệnh build, nên file sinh ra lúc build sẽ không được nhận. Định tuyến + header nằm **một chỗ** (`build-vercel-output.mjs`), `studio/vercel.json` chỉ chứa lệnh build.

## 3. Xác thực và phân quyền (điểm P0)

**Vấn đề**: Sanity xác thực người dùng Studio; CRM cũ dùng Supabase Auth. Hai hệ thống không chia sẻ phiên. Không dùng iframe, thanh điều hướng chung hay việc ẩn menu để *giả* đăng nhập một lần.

**Giải pháp (cầu nối danh tính, một nhà cung cấp danh tính = Sanity)**

1. Studio chạy `auth: { loginMethod: 'token' }`: người dùng đăng nhập Sanity như bình thường; Studio giữ token phiên của chính họ.
2. Công cụ Lead gửi token đó trong `Authorization: Bearer` tới `/api/portal` (không cookie ⇒ không có bề mặt CSRF).
3. **Máy chủ không tin gì trình duyệt khai** (vai trò, e-mail). Nó hỏi `https://iqyx5ttc.api.sanity.io/…/users/me` bằng chính token đó và chỉ chấp nhận khi: Sanity trả đúng một người (`sanityUserId`), có e-mail, là thành viên dự án, **không phải token API/robot** (`provider: sanity-token`). Sanity lỗi / quá 4 giây ⇒ `503`, **không bao giờ** mặc định cho qua. Kết quả `200` mà không có người dùng (Sanity trả `200` cả khi không gửi token) bị từ chối.
4. Danh sách nhân sự `crm_staff` là **nguồn quyền duy nhất** của CRM: vai trò (`admin`/`staff`), phạm vi loại lead (hội viên / bản tin / liên hệ), đang hoạt động. Lần đăng nhập đầu **gắn** (e-mail ⇄ `sanity_user_id`); các lần sau yêu cầu **cả hai** khớp, nên đổi e-mail ở Sanity không chiếm được dòng của người khác. Admin có thể *đặt lại liên kết*.
5. Mỗi thao tác Lead/Nhân sự được kiểm tra lại **trong cơ sở dữ liệu** (hàm `SECURITY DEFINER`, chỉ `service_role` gọi được, `search_path` rỗng): IDOR / ngoài phạm vi trả 404, ghi chú và đổi trạng thái có tác giả lấy từ DB, đổi trạng thái dùng khoá lạc quan (trạng thái cũ phải khớp).
6. **Đăng xuất Sanity ⇒ mất quyền ngay ở lần gọi kế tiếp** (không có phiên thứ hai để thu hồi). Tắt một nhân viên trong *Quản trị nhân sự* có hiệu lực ngay.
7. **Nhật ký kiểm toán không bị làm đầy**: đăng nhập lặp lại trong 15 phút không ghi gì; một thành viên Sanity ngoài danh sách chỉ để lại một hàng cho mỗi e-mail + lý do + giờ (migration `0010`). E-mail phải là ASCII in được và được kiểm trước khi gấp chữ.
8. Khoá service-role **chỉ** nằm trong biến môi trường của Function; bước kiểm tra build (`scripts/check-vercel-output.mjs`) quét `static/` để chắc chắn tên khoá, mã dự án Supabase và tên hàm CRM không lọt ra trình duyệt. Log chỉ có: thao tác, mã trạng thái, vai trò, thời gian — không e-mail, token hay dữ liệu lead.

Hai lớp quyền **độc lập**: quyền sửa nội dung = vai trò trong dự án Sanity; quyền xem lead = dòng `crm_staff`. Thành viên Sanity không có dòng `crm_staff` sửa được nội dung nhưng thấy "không có quyền" ở Lead; người có dòng `crm_staff` mà không phải thành viên Sanity không mở được Studio.

## 4. Cách triển khai (một lần, Owner)

Xem **Bước 8** trong `docs/OWNER_SETUP_GUIDE.vi.md`. Tóm tắt thiết lập Vercel project `vbfa-admin`:

| Thiết lập | Giá trị |
|---|---|
| Git repository | `Quangnm0208/VFBA-website`, Production Branch để mặc định; chỉ nhánh `feat/vbfa-services-activation-20261022` được build (`ignoreCommand` trong `studio/vercel.json`) |
| Root Directory | `studio` |
| Framework Preset | Other (build/install lấy từ `studio/vercel.json`) |
| "Include source files outside of the Root Directory in the Build Step" | **Bật** (mặc định; Function đọc `../src/lib/server/crm`) |
| Deployment Protection | **Vercel Authentication: bật** (Preview), tạo *Protection Bypass for Automation* → lưu vào GitHub secret `VBFA_ADMIN_PROTECTION_BYPASS` |
| Biến môi trường (Preview, đúng nhánh) | `SUPABASE_URL` = `https://bzrtllytykldnawbuszu.supabase.co` · `SUPABASE_SERVICE_ROLE_KEY` (**Sensitive**) · `SANITY_STUDIO_PROJECT_ID` = `iqyx5ttc` · `SANITY_STUDIO_DATASET` = `production` |
| Sanity CORS | đúng một origin `https://vbfa-admin-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app` (workflow `run-sanity-cors` thêm; **không** dùng `*.vercel.app` kèm credentials) |

Điều kiện đăng nhập: e-mail tài khoản Sanity của người dùng phải bằng e-mail trong `crm_staff`.

## 5. Những gì đã kiểm thử và bằng gì

| Lớp | Bằng chứng | Thật hay mô phỏng |
|---|---|---|
| SQL của danh tính (migrations `0009`, `0010`) | 20 test trên PGlite (SQL thật) + cả hai migration đã áp dụng lên Supabase thật (dấu vân tay 112 hàng khớp repo) | SQL thật; Supabase thật cho phần áp dụng |
| Bộ kiểm tra danh tính Sanity | 10 test. Đã **quan sát thật** (probe `39958212710`): token robot → 200, `provider: sanity-token`, không e-mail; token sai → 401; không token → 200 không có người dùng. **Chưa quan sát**: phản hồi cho phiên trình duyệt của người thật (cùng bộ khoá được tài liệu hoá; test dùng bản mô phỏng) | mô phỏng; chỉ phần từ chối được quan sát thật |
| Bộ xử lý `/api/portal` | 24 test: phương thức, origin, content-type, giới hạn, thứ tự xác thực, RBAC, IDOR, log | mô phỏng Sanity, SQL thật |
| Màn hình (Chromium) | `scripts/qa/portal-browser.mjs` **52/52**: bộ lọc, phân trang, chi tiết, đổi trạng thái, ghi chú, phạm vi, IDOR, Admin/Staff, axe-core 0 lỗi, 5 độ rộng, không cookie/storage, log sạch | màn hình + bundle Function + SQL thật; **Sanity mô phỏng, vỏ Studio không có** |
| Build kiểu Vercel | cây output dựng được khi chỉ cài `studio/` (không có `node_modules` ở gốc), `check-vercel-output.mjs` 8/8 | thật (cục bộ) |
| Triển khai thật | `scripts/qa/portal-live.mjs` (workflow `run-portal-live`): bảo vệ, header, định tuyến, 405/401/403/413, token lạ và token robot **hỏi API Sanity thật** | chạy được sau khi Owner tạo project (§4) |

## 6. Rủi ro và giới hạn đã biết

| # | Mức | Nội dung | Xử lý |
|---|---|---|---|
| P-1 | P1 — cần Owner chấp nhận | Chế độ `token` lưu token phiên Sanity trong `localStorage` của origin portal; một lỗ hổng XSS ở origin này lấy được token. | Origin riêng chỉ chứa Studio; React thoát ký tự (test chèn markup xác nhận hiển thị dạng văn bản); không script bên thứ ba; CSP **Report-Only** hiện chỉ báo cáo — chuyển sang chặn sau khi Owner đăng nhập thật và xác nhận không có vi phạm. |
| P-2 | P2 | `npm audit` của `studio/` báo 16 (7 trung bình, 9 cao), **đều là công cụ build/CLI của `sanity`** (braces, micromatch, js-yaml, smol-toml, uuid…); **không** nằm trong bundle của Function (chỉ `@supabase/*`, `tslib`). Bản sửa là hạ `sanity` xuống 5.14.1 (thay đổi phá vỡ). | Chấp nhận; xem lại ở mỗi bản `sanity` mới. |
| P-3 | P2 | `Content-Security-Policy-Report-Only` có `script-src 'unsafe-inline'` vì phần khởi động của Studio dùng script nội tuyến. | Cân nhắc băm (hash) hoặc nonce khi chuyển sang chế độ chặn. |
| P-4 | P2 | Chưa có giới hạn tốc độ riêng cho `/api/portal` (Vercel Firewall rule: kết nối của agents không có quyền, mục WAF của Gate 3). | Mọi lời gọi đều xác minh với Sanity (4 giây tối đa) và bị chặn bởi allowlist; Owner tạo rule rate-limit theo `docs/SECURITY_REPORT.md`. |
| P-5 | P3 | Hai đường vào CRM cùng tồn tại: Portal (danh tính Sanity) và `/admin/` của website (Supabase Auth). | Giữ `/admin/` cho tới khi Owner nghiệm thu Portal (không xoá mô hình đã kiểm thử); sau đó Owner quyết định gỡ. Rollback đã được kiểm: người có lần đăng nhập đầu qua Portal vẫn vào được `/admin/` (mã giữ chỗ được thay bằng mã Auth thật; một tài khoản Supabase Auth cùng e-mail do Owner tạo có thể thay mã giữ chỗ — cùng mức tin cậy với một hàng chưa gắn, nên giữ tắt đăng ký công khai, SEC-C1). |
| P-7 | P3 | Lần đăng nhập đầu tin vào e-mail mà Sanity báo; chưa ràng buộc nhà cung cấp, chưa quan sát phiên người thật. | Vào được phải là thành viên dự án (Owner đã mời đúng e-mail, Sanity đã xác minh khi nhận lời mời). Kiểm ở Bước 8f. |
| P-8 | P3 | Token phiên Sanity không gắn với origin: mọi token hợp lệ của thành viên dự án đều gọi được `/api/portal`. | Cùng mức rủi ro với việc token đó gọi được API Sanity; dữ liệu lead nằm ở Supabase và cần dòng `crm_staff` hợp lệ; xem P-1. |
| P-6 | — | `vbfa-site.sanity.studio` vẫn chạy cùng cấu hình: công cụ Lead ở đó trả "chỉ có ở Cổng quản trị" (không có API). | Dùng làm phương án dự phòng chỉ cho nội dung. |

## 7. Trạng thái "một lần đăng nhập" — chưa tuyên bố đạt

- **Đã chứng minh** (kiểm thử + dịch vụ thật): quy tắc từ chối (không token, token lạ, robot, không có trong danh sách), RBAC, IDOR, thứ tự xác thực, không rò khoá.
- **Chưa chứng minh bằng dịch vụ thật**: đường dương — *một người thật đăng nhập Sanity rồi mở Quản lý Lead*. Phiên đăng nhập Sanity cần trình duyệt và tài khoản của người thật, nên agents không tự động hoá được. **Đây là bước nghiệm thu của Owner** (Bước 8e trong hướng dẫn).
- **Cho tới khi Owner xác nhận Bước 8e, trạng thái là `PENDING OWNER VERIFICATION`, không phải `SSO PASS`.**
- Nếu bước 8e thất bại và không sửa được an toàn trong gói này, ngoại lệ Beta xin Owner chấp thuận: **một URL, hai cách đăng nhập** (Portal cho Nội dung bằng Sanity; `/admin/` cho Lead bằng Supabase Auth). Mô hình đã kiểm thử đó chưa bị xoá.

## 8. Quay lui

0. **Khi phát hành (sau Owner GO)**: `studio/vercel.json` đang chỉ build nhánh Beta (`ignoreCommand`) và `ssoProtection` bật. Khi chuyển Cổng quản trị sang nhánh/miền chính thức, phải đổi `ignoreCommand`, Production Branch, biến môi trường Production và origin CORS của Sanity — nếu không project ngừng build sau khi hợp nhất vào `main`.
1. Gỡ/tạm dừng project `vbfa-admin` (không ảnh hưởng website, CMS hay CRM `/admin/`).
2. Nội dung vẫn sửa được ở `https://vbfa-site.sanity.studio`; Lead vẫn xử lý ở `<website>/admin/`.
3. Migration `0009` chỉ **thêm** (cột `sanity_user_id`, 3 hàm); không cần hoàn tác để quay lui.
