# Sơ đồ dữ liệu cá nhân (sự kiện kỹ thuật, KHÔNG phải văn bản pháp lý)

Tài liệu này chỉ liệt kê **sự thật kỹ thuật** để bộ phận pháp lý của VBFA soạn Chính sách bảo mật, câu đồng ý và thời hạn lưu giữ.
Kỹ sư không soạn nội dung pháp lý và không đưa khẳng định pháp lý nào lên website. Mọi chỗ ghi **[PHÁP LÝ QUYẾT ĐỊNH]** là việc chưa có người duyệt.

## 1. Dữ liệu thu thập

| Biểu mẫu | Trường | Bắt buộc | Lưu ở đâu | Phiên bản đồng ý lưu kèm |
|---|---|---|---|---|
| Hội viên (`/api/join/`) | họ tên, tổ chức, e-mail, điện thoại (tuỳ chọn), nhu cầu, nội dung thêm (≤1000 ký tự) | tên, tổ chức, e-mail, ô đồng ý | `public.website_leads` | `join-v2` (nội dung câu đồng ý nằm trong Sanity → Thông tin chung → Biểu mẫu) |
| Bản tin (`/api/newsletter/`) | e-mail | e-mail, ô đồng ý riêng | `public.website_leads` (`kind = newsletter`, một hàng cho mỗi địa chỉ) | `newsletter-v1` (câu đồng ý đang viết cứng trong `NewsletterBand.astro` **[PHÁP LÝ QUYẾT ĐỊNH nội dung; sau đó chuyển sang CMS]**) |
| Cả hai | nguồn trang (`source_path`, không có query), `utm_source/medium/campaign` (nếu có), thời điểm đồng ý | tự động | cùng hàng | |
| Cả hai | băm HMAC có muối của địa chỉ IP (`ip_hash`, 32 ký tự hex) | tự động | cùng hàng và bảng `form_attempts` | |

Không lưu: IP thô, user-agent. Website không đặt cookie. Trình duyệt chỉ lưu cục bộ (không gửi đi) khoá `vbfa:popup:<id>` trong `localStorage`/`sessionStorage` để nhớ pop-up đã đóng, và chỉ khi có pop-up được tạo trong Sanity. Vercel Web Analytics tắt mặc định (`ENABLE_VERCEL_ANALYTICS`). Widget Cloudflare Turnstile (khi bật) do Cloudflare vận hành và có thể lưu dữ liệu riêng của họ **[PHÁP LÝ QUYẾT ĐỊNH nội dung thông báo]**.

## 2. Bên xử lý và vị trí

| Bên | Vai trò | Dữ liệu đi qua | Vị trí |
|---|---|---|---|
| Vercel | lưu trang tĩnh, chạy Function nhận biểu mẫu, nhật ký kỹ thuật | nội dung biểu mẫu trong lúc xử lý; nhật ký đã lọc (không có e-mail, tên, IP, khoá) | Function ở `sin1` (Singapore) |
| Supabase (dự án `bzrtllytykldnawbuszu`) | cơ sở dữ liệu lead | toàn bộ trường ở mục 1 | `ap-northeast-2` (Seoul) |
| Cloudflare Turnstile | chống bot trên cả hai biểu mẫu | token trình duyệt, IP của người truy cập (gửi tới Cloudflare khi xác minh) | Cloudflare |
| Sanity | nội dung biên tập | không có dữ liệu người truy cập | Sanity Content Lake |

**[PHÁP LÝ QUYẾT ĐỊNH]** nghĩa vụ liên quan chuyển dữ liệu ra nước ngoài (Singapore, Hàn Quốc, bên thứ ba) và hợp đồng xử lý dữ liệu với từng bên.

## 3. Thời hạn lưu (đã cài đặt) và thời hạn chưa quyết định

| Dữ liệu | Hiện trạng kỹ thuật |
|---|---|
| `ip_hash` trên lead | xoá (đặt NULL) sau **30 ngày** bởi `purge_lead_metadata()`, lịch hằng ngày 03:17 UTC (chưa chạy lần nào tính đến 2026-10-22; xem bằng chứng) |
| Bộ đếm `form_attempts` | xoá sau **2 ngày** bởi cùng hàm |
| **Hàng lead (tên, e-mail, tổ chức...)** | **không bao giờ tự xoá**. **[PHÁP LÝ QUYẾT ĐỊNH thời hạn]**; sau đó kỹ sư thêm lịch xoá |

## 4. Quyền của người có dữ liệu: các bước kỹ thuật đã sẵn có

- Tra cứu: `select * from public.website_leads where lower(email) = lower('<email>');`
- Xoá: `delete from public.website_leads where lower(email) = lower('<email>');` rồi ghi ngày/giờ và người thực hiện vào sổ yêu cầu. Bộ đếm không chứa dữ liệu cá nhân.
- Rút lại đồng ý bản tin: hiện **chưa có liên kết huỷ đăng ký tự động** (không gửi bản tin từ hệ thống này). **[PHÁP LÝ / VẬN HÀNH QUYẾT ĐỊNH]** quy trình tiếp nhận yêu cầu và thời hạn phản hồi.

## 5. Việc cần trước khi `LEADS_ENABLED=true` trên Production

1. Chính sách bảo mật được duyệt bằng văn bản và xuất bản (trang tĩnh trong Sanity), rồi chọn trang đó ở Thông tin chung → Biểu mẫu → "Trang Chính sách bảo mật".
2. Câu đồng ý hội viên và bản tin được duyệt; cập nhật phiên bản (`join-v3`, `newsletter-v2`...) khi sửa chữ.
3. Thời hạn lưu hàng lead và quy trình yêu cầu của người có dữ liệu được ghi thành văn bản.
4. Danh sách bên xử lý ở mục 2 được pháp lý xác nhận (kể cả chuyển dữ liệu xuyên biên giới).
