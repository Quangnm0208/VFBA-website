# CRM Lead Inbox (Beta): kiến trúc, bảo mật và hướng dẫn sử dụng

> Trạng thái: **Beta, chạy trên Preview được bảo vệ**. Tắt mặc định (`CRM_ENABLED` khác `true` thì mọi đường dẫn `/admin/` trả 404). Chưa nằm trong bản Production.
> Tài liệu này mô tả đúng những gì đã được xây và kiểm thử. Những gì **chưa có** nằm ở mục 10.

## 1. CRM Beta là gì (và không là gì)

Một giao diện nhẹ, dựng phía máy chủ, để nhân sự VBFA được mời xem và xử lý các khách đã gửi biểu mẫu `Quan tâm hội viên` và `Đăng ký bản tin`:

| Có | Không có trong Beta |
|---|---|
| Đăng nhập Supabase Auth, chỉ nhân sự được mời (không đăng ký công khai) | Gửi email mời / quên mật khẩu tự phục vụ (cấp và đặt lại mật khẩu ở bảng điều khiển Supabase) |
| Hai vai trò: **Quản trị** (quản lý người dùng CRM + xem/sửa khách) và **Nhân viên** (xem/sửa khách trong phạm vi được giao) | Phân công khách cho từng người, nhiều nhóm, quyền chi tiết hơn |
| Hộp thư khách: lọc theo loại, trạng thái, ngày; tìm theo tên, tổ chức, email; phân trang (25/trang) | Xuất CSV hàng loạt, nhập dữ liệu, báo cáo, biểu đồ |
| Chi tiết khách: thông tin gửi, **phiên bản câu đồng ý, thời điểm đồng ý, trang nguồn**, UTM | Gửi email chiến dịch, tự động hoá marketing, tích hợp CRM ngoài |
| Quy trình trạng thái **Mới → Đang xử lý → Đã đóng** (đi lại giữa ba trạng thái) | Trạng thái tuỳ biến |
| Ghi chú nội bộ có người viết và thời gian | Tệp đính kèm, nhắc việc |
| Nhật ký thao tác (audit) không chứa dữ liệu cá nhân của khách | Giao diện xem nhật ký (đọc bằng SQL; xem mục 8) |
| Đăng xuất, hết phiên (không thao tác 30 phút; tối đa 8 giờ), đổi mật khẩu | Xác thực hai lớp (bật ở Supabase khi cần; chưa tích hợp vào giao diện) |

## 2. Kiến trúc

```
Trình duyệt ──HTTPS──▶ Vercel Function (cùng hàm với /api/*, vùng sin1)
  (không script,        │  /admin/*  ← src/pages/admin/[...path].ts → src/lib/server/crm/*
   chỉ HTML + CSS)      │
                        ├─ Supabase Auth  (đăng nhập, kiểm tra phiên MỖI request, làm mới token, thu hồi khi đăng xuất)
                        │    khoá công khai (publishable) – chỉ để gọi Auth
                        └─ Supabase Postgres (RPC SECURITY DEFINER, service-role key – chỉ ở máy chủ)
                             crm_staff · lead_notes · crm_audit_log · crm_login_attempts · website_leads (đã có)
```

- Trang CRM **không có JavaScript phía trình duyệt**: biểu mẫu HTML thuần (GET để lọc, POST để thao tác). CSP là `default-src 'none'; style-src 'self'; …` (không `script-src`).
- Mọi truy cập dữ liệu đi qua 11 hàm SQL của migration `0007` (`supabase/migrations/…_0007_crm_lead_inbox.sql`), được siết thêm ở `0008_crm_review_hardening` sau rà soát độc lập. Trình duyệt **không bao giờ** nói chuyện trực tiếp với Postgres.
- Hàm chỉ chạy ở `/admin/*` khi `CRM_ENABLED=true` và có đủ `SUPABASE_URL` (https), `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `IP_HASH_SALT`. Thiếu một thứ: 503 (đóng, không rơi về cấu hình yếu).

## 3. Mô hình truy cập

| Khái niệm | Cách hoạt động |
|---|---|
| Danh tính | Tài khoản **Supabase Auth** (email + mật khẩu), do quản trị tạo trong bảng điều khiển (Authentication → Users → *Add user*, tích *Auto Confirm*). Đăng ký công khai **phải tắt** |
| Cấp quyền CRM | Bảng `public.crm_staff` (danh sách cho phép) do **quản trị** quản lý: email, vai trò (`admin`/`staff`), phạm vi loại khách (`membership`, `newsletter`, `contact`), bật/tắt |
| Gắn tài khoản | Lần đăng nhập đầu tiên, `user_id` của Supabase Auth được **gắn** vào dòng `crm_staff` (theo email). Một tài khoản Auth khác dùng cùng email bị từ chối (phải “Đặt lại liên kết” bởi quản trị) |
| Vai trò | Lưu trong `crm_staff`, **không** đọc từ metadata người dùng tự sửa được |
| Phạm vi | Nhân viên chỉ thấy/sửa loại khách trong phạm vi. Ngoài phạm vi, khách không tồn tại hoặc đã xoá cho kết quả giống hệt nhau (404): không lộ “có hay không” |
| Quản trị cuối cùng | Không thể hạ vai trò hoặc vô hiệu hoá quản trị đang hoạt động cuối cùng |

Mã trạng thái HTTP: chưa đăng nhập → **401** (trang đăng nhập); đăng nhập nhưng không có quyền → **403**; khách ngoài phạm vi / không tồn tại / id sai → **404**; sai nguồn gốc (CSRF) → **403**; quá nhiều lần thử đăng nhập → **429**.

## 4. Các biện pháp bảo mật (đã kiểm thử)

| Biện pháp | Chi tiết |
|---|---|
| Phiên | 3 cookie `__Secure-vbfa-at/-rt/-ss`: HttpOnly, Secure, SameSite=Strict, Path=/admin. Token Supabase được **kiểm tra với Supabase ở mỗi request** (không tin cookie); hết hạn thì làm mới bằng refresh token. Đồng hồ phiên có chữ ký HMAC (khoá dẫn xuất từ service-role key) và **gắn với người dùng**: **30 phút không thao tác** hoặc **8 giờ** kể từ lúc đăng nhập thì phải đăng nhập lại, và phiên Supabase tương ứng **bị thu hồi**. Cookie trùng tên bị từ chối |
| Đăng xuất / đổi mật khẩu | Đăng xuất xoá cookie **và thu hồi phiên ở Supabase** (kể cả khi access token đã hết hạn): cookie đã sao chép không dùng lại được (kiểm bằng replay). Đổi mật khẩu thu hồi **mọi phiên khác** của người đó |
| CSRF | Chỉ POST từ form cùng nguồn: `Origin` phải **cùng origin** (không nhận origin phụ như form công khai) + `Sec-Fetch-Site` + cookie SameSite=Strict + kiểm tra origin của Astro. `Referrer-Policy: same-origin` là bắt buộc (với `no-referrer`, trình duyệt gửi `Origin: null` và mọi form bị từ chối) |
| Thử mật khẩu | Giới hạn theo địa chỉ (20/10 phút) và theo **cặp (email, địa chỉ)** (8/10 phút) bằng HMAC có muối; lượt bị từ chối không được lưu; người lạ ở địa chỉ khác **không khoá được** người thật. Đăng nhập sai, tài khoản không có quyền, chưa xác nhận đều cho **cùng một thông báo** |
| Cache / index | Mọi phản hồi `Cache-Control: private, no-store`, `X-Robots-Tag: noindex…`, `X-Frame-Options: DENY`, CSP không script; `robots.txt` chặn `/admin/`; `vercel.json` đặt lại các header này ở tầng nền tảng |
| XSS | Mọi giá trị khách gửi được **escape** (mẫu HTML tự escape); không có script/style nội tuyến/handler |
| Cơ sở dữ liệu | RLS bật, **không có policy**, `anon`/`authenticated` **không có quyền**; 11 hàm `SECURITY DEFINER` (`search_path=''`) chỉ `service_role` gọi được, và **mỗi hàm tự kiểm tra lại người thực hiện** (hàng `crm_staff` đang hoạt động) + phạm vi |
| Log | Chỉ `route`, `status`, `role`, `durationMs`, mã lỗi cố định; không có email, tên, ghi chú, token, địa chỉ IP |
| Nhật ký thao tác | `crm_audit_log`: đăng nhập, đăng xuất, bị từ chối, mở khách, đổi trạng thái (từ→sang), thêm ghi chú (chỉ id ghi chú), thay đổi người dùng. Không chứa tên/email/ghi chú của khách |

## 5. Hướng dẫn cho **Quản trị**

### 5.1 Cấp quyền người đầu tiên (một lần)
1. Supabase → *Authentication → Sign In / Providers*: **tắt** “Allow new users to sign up”.
2. *Authentication → Users → Add user → Create new user*: nhập email + mật khẩu mạnh, tích **Auto Confirm User**. (Mật khẩu chỉ gõ ở đây, không gửi qua chat.)
3. *SQL Editor*, chạy (thay email):
   ```sql
   insert into public.crm_staff (email, role, created_by) values (lower('email-quan-tri@vi-du.vn'), 'admin', 'bootstrap');
   ```
4. Mở địa chỉ CRM (`<website>/admin/`), đăng nhập. Lần đầu sẽ gắn tài khoản. Vào *Tài khoản* để đổi mật khẩu.

### 5.2 Mời nhân viên
1. Supabase: *Add user* (như trên) cho nhân viên, gửi mật khẩu tạm qua kênh an toàn.
2. CRM → **Người dùng CRM** → “Cấp quyền hoặc cập nhật”: email, vai trò, tích phạm vi loại khách → *Lưu*. Trạng thái hiện “Đã cấp quyền, chưa đăng nhập” cho đến khi họ đăng nhập.
3. Nhắc nhân viên đổi mật khẩu ở mục *Tài khoản*.

### 5.3 Thu hồi
- CRM → **Người dùng CRM** → *Vô hiệu hoá*: có hiệu lực **ngay ở thao tác kế tiếp** (phiên đang mở bị từ chối 403). *Kích hoạt lại* để mở lại.
- Muốn chặn hẳn: xoá hoặc ban người dùng ở Supabase *Authentication → Users*.
- Tài khoản Auth bị xoá rồi tạo lại (ID đổi): tích “Đặt lại liên kết tài khoản” khi *Lưu*.
- Quên mật khẩu: đặt lại ở Supabase (*Users → … → Send password recovery* cần SMTP; hoặc đặt mật khẩu mới).

### 5.4 Cổng bắt buộc trước khi dùng dữ liệu thật
1. **Tắt đăng ký công khai** của Supabase Auth (kiểm tự động: kiểm thử thật báo ĐỎ nếu còn bật). Lý do: lần đăng nhập đầu gắn tài khoản theo email; nếu ai cũng đăng ký được, người đến trước có thể chiếm email được cấp quyền.
2. **Tạo tài khoản Auth trước, rồi mới thêm hàng cho phép** (thứ tự ở 5.1/5.2).
3. Dùng mật khẩu mạnh (CRM yêu cầu ≥ 12 ký tự khi đổi mật khẩu); cân nhắc bật MFA/CAPTCHA/time-box phiên trong Supabase (một số cần gói trả phí: cần phê duyệt chi phí).
4. Quy tắc WAF/rate limit của Vercel cho `/api/*` và `/admin/*` (hướng dẫn ở `docs/SECURITY_REPORT.md` SEC-C4).

## 6. Hướng dẫn cho **Nhân viên**
1. Đăng nhập bằng email + mật khẩu được cấp.
2. **Khách quan tâm**: danh sách mới nhất trước. Dùng ô *Tìm kiếm* và bộ lọc *Loại / Trạng thái / Từ ngày / Đến ngày*, bấm *Lọc*.
3. Bấm **Xem** để mở chi tiết: thông tin người gửi, **đồng ý** (phiên bản câu, thời điểm), trang nguồn.
4. Đổi trạng thái bằng nút: *Chuyển sang “Đang xử lý”*, *Đóng*, *Đưa về “Mới”*. Nếu người khác đã đổi trước, hệ thống báo xung đột và tải lại, không ghi đè.
5. **Ghi chú nội bộ**: nhập và *Lưu ghi chú* (ghi tên bạn và thời gian). Ghi chú chỉ nhân sự CRM thấy.
6. *Đăng xuất* khi xong. Phiên tự hết sau 30 phút không thao tác.

## 7. Công tắc và biến môi trường

| Biến | Vai trò | Bí mật |
|---|---|---|
| `CRM_ENABLED` | `true` bật `/admin/` (chỉ Preview Beta; **không đặt ở Production** cho đến khi được duyệt) | không |
| `SUPABASE_PUBLISHABLE_KEY` | khoá công khai của Supabase, chỉ dùng để gọi Auth | không (công khai theo thiết kế) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT` | đã dùng cho biểu mẫu; CRM dùng lại (không thêm biến trùng) | có |

Đổi biến Vercel cần **dựng lại** (Redeploy → *Preview*, không chọn Production).

## 8. Dữ liệu, quyền riêng tư, lưu giữ

- CRM **không tạo thêm dữ liệu cá nhân của khách**; chỉ hiển thị dữ liệu biểu mẫu đã có và thêm **ghi chú** (do nhân sự viết, có thể chứa dữ liệu cá nhân → xoá cùng khách).
- Yêu cầu xoá dữ liệu của khách: xem `docs/privacy/DATA_SUBJECT_REQUESTS.vi.md`. Xoá dòng `website_leads` sẽ **xoá luôn ghi chú** (cascade); nhật ký thao tác còn lại chỉ có id và trạng thái, không có dữ liệu cá nhân.
- Xem nhật ký thao tác (quản trị, SQL Editor): `select at, actor_email, action, lead_id, detail from public.crm_audit_log order by id desc limit 100;`
- Thời hạn lưu giữ ghi chú/nhật ký/khách: **chờ Owner quyết** (đề xuất trong `docs/privacy/RETENTION_PROPOSAL.vi.md` mục 5).

## 9. Kiểm thử

| Lớp | Công cụ | Số kiểm tra | Thật hay mô phỏng |
|---|---|---|---|
| Cơ sở dữ liệu (quyền, phạm vi, IDOR, quy trình, ghi chú, audit, throttle) | `supabase/crm.test.ts` (PGlite chạy đúng migration) | 36 | SQL thật, Postgres trong tiến trình |
| Bộ xử lý CRM trên SQL thật + Auth giả | `src/lib/server/crm/app.test.ts` | 53 | SQL thật; Auth mô phỏng |
| Hàm Vercel đã biên dịch | `scripts/qa/crm-function.mjs` | 56 | bundle thật + cookie HTTP thật; SQL thật (PGlite); Auth mô phỏng |
| Trình duyệt Chromium (bàn phím, cookie, `Origin` thật của trình duyệt, axe-core WCAG 2.2 AA, 8 độ rộng, zoom 400 %) | `scripts/qa/crm-browser.mjs` | 37 | như trên |
| **Dịch vụ thật** trên Preview (Supabase Auth + Postgres thật) | `scripts/qa/live-e2e.mjs` → `live-crm-e2e.mjs` (workflow *VBFA Preview real-service E2E*) | xem biên bản trong `docs/evidence/` | thật |

Không có kết quả “thật” nào được ghi nhận nếu chưa có biên bản trong `docs/evidence/`.

## 10. Giới hạn đã biết của Beta

- Không có email mời/quên mật khẩu tự phục vụ (cần SMTP riêng của Supabase; Beta dùng bảng điều khiển).
- Không có xuất CSV, phân công, thông báo, báo cáo, tích hợp ngoài.
- Từ khoá tìm kiếm nằm trong URL (nhật ký request của Vercel, lịch sử trình duyệt): tránh gõ dữ liệu cá nhân đầy đủ; xem `docs/SECURITY_REPORT.md` SEC-C2.
- Không giao diện xem nhật ký thao tác; ghi chú không sửa/xoá được từ CRM (xoá theo khách).
- Một ngôn ngữ (tiếng Việt). Ô chọn ngày hiển thị theo ngôn ngữ trình duyệt.
- Tìm kiếm không phân biệt hoa/thường theo cấu hình cơ sở dữ liệu; chưa bỏ dấu tiếng Việt khi tìm.
- Cần Supabase Auth bật xác nhận email hoặc *Auto Confirm* khi tạo người dùng (tài khoản chưa xác nhận bị từ chối).
- Tài khoản kiểm thử tổng hợp (`crm-e2e-*@vbfa-beta.invalid`) tồn tại cho kiểm thử tự động; vô hiệu hoá/xoá khi kết thúc Beta (xem `docs/OPERATIONS.md`).

## 11. Rollback

1. Tắt ngay: xoá hoặc đặt `CRM_ENABLED` khác `true` ở Vercel rồi Redeploy → toàn bộ `/admin/` trả 404.
2. Cơ sở dữ liệu: migration `0007` chỉ **thêm** bảng/hàm; không cần hoàn tác. Nếu bắt buộc gỡ: đóng CRM (bước 1), sao lưu, rồi gỡ hàm/bảng `crm_*` và `lead_notes` bằng một migration có phê duyệt (phá huỷ dữ liệu ghi chú/nhật ký).
