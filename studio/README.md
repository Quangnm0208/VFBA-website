# VBFA · Sanity Content Studio

Mã nguồn CMS chính thức cho website VBFA. Studio là một ứng dụng riêng trong thư mục `studio/`; bài viết, media, trang chủ và thư viện được lưu tại **Sanity Content Lake**, không lưu trên Supabase.

## 1. Kích hoạt tài khoản Sanity (một lần, bởi chủ sở hữu VBFA)

1. Truy cập https://www.sanity.io/manage và đăng nhập tài khoản **do VBFA sở hữu**.
2. Tạo project mới: **VBFA Website** (tên hiển thị), dataset `production`, cho phép public read **chỉ với nội dung dành để xuất bản**.
3. Sao chép **Project ID** (public identifier, không phải mật khẩu).
4. Ở `studio/` tạo `.env` từ `.env.example`:
   ```env
   SANITY_STUDIO_PROJECT_ID=<PROJECT_ID_THAT_SANITY_RETURNS>
   SANITY_STUDIO_DATASET=production
   ```
5. Cài và kiểm tra:
   ```bash
   npm install              # ở thư mục gốc: cần để Vite resolve Astro monorepo tsconfig
   cd studio
   npm install
   npm run dev
   npm run build
   ```
6. Deploy lên hệ thống Sanity:
   ```bash
   npm run deploy
   ```
   CLI sẽ cung cấp hostname hợp lệ thực tế `*.sanity.studio`. Chỉ bàn giao URL sau khi deploy thành công.
7. Vào Sanity Manage → Members để mời người biên tập. **Không chia sẻ tài khoản chung**. Kiểm tra vai trò có sẵn theo gói dịch vụ.

## 2. Kết nối Website

Trên Vercel set:
```env
PUBLIC_SANITY_PROJECT_ID=<ID>
PUBLIC_SANITY_DATASET=production
PUBLIC_SANITY_API_VERSION=2026-03-01
```
Website tự đọc các bản ghi đã xuất bản từ Sanity; không cần `SANITY_AUTH_TOKEN` cho public dataset. Giữ mọi token bí mật ở môi trường server/CI, không thêm vào biến `PUBLIC_*`.

Nội dung 'Trang chủ' và 'Thông tin hiệp hội' là **singleton** có ID cố định (`homePage`, `siteSettings`). Không được nhân bản hai trang này.

## 3. Menu biên tập

| Nhóm quản trị | Tạo/sửa | Mục đích hiển thị |
|---|---|---|
| Nội dung website → Trang chủ | Headline, hero, section, SEO | Trang chủ |
| Nội dung website → Thông tin hiệp hội | Logo, tên, liên hệ, SEO | Header, footer, contact |
| Nội dung website → Lĩnh vực trọng tâm | Card & thứ tự | Section lĩnh vực |
| Tin tức & hoạt động → Bài viết & tin ngành | Nội dung rich text, cover, ngày, category | Tin tức + trang chi tiết |
| Tin tức & hoạt động → Sự kiện | Mô tả, ngày, ảnh | Hoạt động |
| Thư viện → Tài liệu & báo cáo | PDF hoặc link nguồn | Thư viện |
| Kết nối → Đối tác | Tên, logo, liên kết, xác minh | Dành cho giai đoạn sau; chưa hiển thị đối tác trên frontend |

## 4. Quy trình Marketing (UAT)

1. Tạo **Bài viết**, nhập tiêu đề, slug, category, mô tả, nội dung rich text; tải cover & nhập alt text.
2. Nhấn **Save / giữ bản nháp** để người phụ trách xem và duyệt nội dung.
3. **Chỉ Publish** sau khi duyệt và đủ quyền ảnh/tài liệu. `publishedAt` quyết định ngày hiển thị. Sanity Free có thể không có tính năng bắt buộc nhiều cấp phê duyệt; không coi trường trạng thái là quyền truy cập.
4. Mở Vercel Preview của VBFA, kiểm tra article hiển thị với đúng URL `/tin-tuc/[slug]`, cover, tiêu đề, link, mobile.
5. Khi sửa bài đã publish, đọc lại website và ghi nhận cache CDN có thể cần một khoảng trễ trước khi thay đổi hiện ra.

## 5. An toàn nội dung

- Dataset này dành cho tài liệu công khai; **không** lưu ghi chú nội bộ mật, CRM, lead, dữ liệu cá nhân hoặc file hạn chế.
- Chỉ publish đối tác sau khi xác minh. Schema chặn xuất bản nếu `verified` chưa true; phải xác minh ngoài hệ thống.
- Bản nháp là nội dung chưa được website công bố; chỉ query theo published perspective.
- Nội dung hội viên/lead được lưu ở **Supabase** riêng và qua API đã xác thực (không quản lý qua Studio).
- Không đưa `SANITY_AUTH_TOKEN` hoặc `SUPABASE_SERVICE_ROLE_KEY` vào frontend hoặc repository.
- Ảnh và logo lấy từ các file chính thức có quyền sử dụng.

## 6. Trạng thái tại bàn giao source

CMS code, schema và workflow đã được đưa lên GitHub; project Sanity thật, dataset thật, Studio hosted URL, mời thành viên và UAT phải được xác thực riêng. Việc chỉ chạy CI build **không** chứng minh Studio đã được deploy hoặc kết nối.
