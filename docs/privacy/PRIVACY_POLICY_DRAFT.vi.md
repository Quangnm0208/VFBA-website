# CHÍNH SÁCH BẢO MẬT — BẢN NHÁP ĐỂ CHỦ DỰ ÁN VÀ PHÁP LÝ DUYỆT

> **Trạng thái: CHƯA ĐƯỢC DUYỆT. KHÔNG xuất bản lên website, KHÔNG bật `LEADS_ENABLED=true` trên Production cho tới khi
> văn bản này (hoặc bản do pháp lý sửa) được duyệt bằng văn bản.**
>
> Văn bản soạn từ `docs/privacy/DATA_MAP.md` (sự thật kỹ thuật đã kiểm chứng trong mã nguồn và trên dự án Supabase thật).
> Kỹ sư không quyết định nội dung pháp lý. Mọi chỗ **[CHỜ OWNER]** là thông tin chỉ VBFA có; mọi chỗ **[CHỜ PHÁP LÝ]** là
> nội dung phải được người có thẩm quyền xác nhận (căn cứ pháp lý, thời hạn luật định, nghĩa vụ chuyển dữ liệu ra nước ngoài).
> Gợi ý văn bản áp dụng đã có trong Studio: Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP
> (hiệu lực 01/01/2026) — **[CHỜ PHÁP LÝ xác nhận văn bản hiện hành]**.
>
> Cách đưa lên website sau khi duyệt: Studio → Trang tĩnh → tạo trang `chinh-sach-bao-mat` → dán nội dung từ dòng
> "Phiên bản" trở xuống → Publish → Thông tin chung → Biểu mẫu → chọn "Trang Chính sách bảo mật" (khi đó cả hai ô đồng ý
> tự có liên kết). Chỉ dùng tiêu đề H2 và danh sách gạch đầu dòng (đúng những gì trình soạn thảo cho phép).

---

**Phiên bản:** [CHỜ OWNER: ví dụ 1.0] · **Có hiệu lực từ:** [CHỜ OWNER] · **Cập nhật lần cuối:** [CHỜ OWNER]

## 1. Chúng tôi là ai

Website này do [CHỜ OWNER: tên pháp lý đầy đủ — dự kiến "Hiệp hội Nhiên liệu Sinh học Việt Nam (VBFA)"], địa chỉ
[CHỜ OWNER], vận hành. Trong chính sách này, "VBFA", "chúng tôi" là đơn vị đó. VBFA là bên quyết định mục đích và phương
tiện xử lý dữ liệu cá nhân thu thập qua website. Liên hệ về dữ liệu cá nhân: [CHỜ OWNER: địa chỉ email riêng cho việc này].

## 2. Phạm vi

Chính sách áp dụng cho dữ liệu cá nhân bạn gửi qua hai biểu mẫu trên website: biểu mẫu **kết nối / quan tâm hội viên** và
biểu mẫu **đăng ký nhận bản tin**, cùng một số dữ liệu kỹ thuật tự động đi kèm. Chính sách không áp dụng cho website của bên thứ ba
mà bạn truy cập qua liên kết.

## 3. Dữ liệu chúng tôi thu thập

Biểu mẫu kết nối / quan tâm hội viên:

- Họ và tên, tổ chức / doanh nghiệp, địa chỉ email công việc (bắt buộc).
- Số điện thoại, nhu cầu kết nối, nội dung bạn nhập thêm (không bắt buộc; nội dung thêm tối đa 1.000 ký tự).
- Việc bạn đã tích ô đồng ý, thời điểm đồng ý và **phiên bản** câu đồng ý bạn đã thấy.

Biểu mẫu đăng ký bản tin:

- Địa chỉ email (bắt buộc), việc bạn đã tích ô đồng ý nhận bản tin, thời điểm đồng ý và phiên bản câu đồng ý.

Dữ liệu kỹ thuật tự động đi kèm cả hai biểu mẫu:

- Trang bạn đang xem khi gửi (chỉ đường dẫn, **không** kèm phần truy vấn hay mã sau dấu `#`).
- Tham số chiến dịch `utm_source`, `utm_medium`, `utm_campaign` nếu địa chỉ truy cập có sẵn.
- Một **mã băm một chiều có muối** của địa chỉ IP của bạn, chỉ dùng để chống lạm dụng (giới hạn số lần gửi). Chúng tôi **không lưu địa chỉ IP gốc**
  và không thể khôi phục địa chỉ IP từ mã này.

Chúng tôi **không** thu thập: user-agent của trình duyệt, vị trí, dữ liệu nhạy cảm. Website **không đặt cookie**.
Trình duyệt của bạn có thể lưu cục bộ (không gửi về máy chủ) một mục nhỏ để nhớ rằng bạn đã đóng một cửa sổ thông báo.
Khi bạn mở biểu mẫu, dịch vụ chống thư rác Cloudflare Turnstile được tải; xem mục 6.

## 4. Mục đích và cơ sở xử lý

| Mục đích | Dữ liệu | Cơ sở |
|---|---|---|
| Liên hệ, phản hồi yêu cầu kết nối / quan tâm hội viên của bạn | họ tên, tổ chức, email, điện thoại, nhu cầu, nội dung thêm | Sự đồng ý của bạn (ô đồng ý trên biểu mẫu) **[CHỜ PHÁP LÝ xác nhận cơ sở]** |
| Gửi bản tin của VBFA qua email | email | Sự đồng ý của bạn (ô đồng ý riêng, không tích sẵn) **[CHỜ PHÁP LÝ]** |
| Chống thư rác, chống lạm dụng, giữ website hoạt động ổn định | mã băm địa chỉ IP, số lần gửi, token Turnstile | Lợi ích chính đáng của VBFA trong việc bảo vệ hệ thống **[CHỜ PHÁP LÝ]** |
| Chứng minh bạn đã đồng ý | thời điểm và phiên bản câu đồng ý | Nghĩa vụ chứng minh sự đồng ý **[CHỜ PHÁP LÝ]** |

Chúng tôi không bán dữ liệu của bạn và không dùng dữ liệu của bạn cho mục đích khác với bảng trên nếu chưa có sự đồng ý mới của bạn.
Chúng tôi không ra quyết định tự động có ảnh hưởng pháp lý đối với bạn.

## 5. Ai xử lý dữ liệu thay mặt chúng tôi

- **Vercel Inc.** — lưu trữ website và chạy chức năng nhận biểu mẫu (máy chủ chức năng đặt tại Singapore). Hạ tầng của Vercel có thể ghi nhật ký
  kết nối kỹ thuật, trong đó có địa chỉ IP, theo điều khoản của họ **[CHỜ PHÁP LÝ: xác nhận cách mô tả này]**. Nhật ký ứng dụng của VBFA được lọc
  để không chứa email, họ tên, địa chỉ IP hay khoá bí mật.
- **Supabase** — cơ sở dữ liệu lưu thông tin biểu mẫu (khu vực Seoul, Hàn Quốc).
- **Cloudflare, Inc. (Turnstile)** — xác minh bạn không phải máy tự động. Khi xác minh, token từ trình duyệt và địa chỉ IP của bạn được gửi tới Cloudflare.
- **Sanity** — soạn nội dung website. Dịch vụ này **không** nhận dữ liệu của người truy cập.

Dữ liệu của bạn có thể được xử lý ở ngoài lãnh thổ Việt Nam (Singapore, Hàn Quốc và nơi Cloudflare vận hành).
**[CHỜ PHÁP LÝ: nghĩa vụ lập hồ sơ / thông báo khi chuyển dữ liệu ra nước ngoài và hợp đồng xử lý dữ liệu với từng bên trên.]**
Chúng tôi chỉ cung cấp dữ liệu cho cơ quan nhà nước có thẩm quyền khi có yêu cầu hợp pháp bằng văn bản.

## 6. Cloudflare Turnstile

Hai biểu mẫu dùng Cloudflare Turnstile để chống thư rác. Cloudflare xử lý dữ liệu này theo chính sách của họ
**[CHỜ PHÁP LÝ: dẫn chiếu chính sách của Cloudflare và xác nhận cách thông báo]**. Nếu bạn không muốn dùng Turnstile, bạn có thể liên hệ chúng tôi qua email ở mục 1.

## 7. Chúng tôi lưu dữ liệu bao lâu

| Dữ liệu | Thời hạn | Tình trạng |
|---|---|---|
| Mã băm địa chỉ IP gắn với yêu cầu | 30 ngày, sau đó tự xoá | Đã cài đặt (lịch hằng ngày 03:17 UTC) |
| Bộ đếm số lần gửi (không chứa dữ liệu cá nhân) | 2 ngày, sau đó tự xoá | Đã cài đặt |
| Thông tin biểu mẫu kết nối / quan tâm hội viên | [CHỜ OWNER: đề xuất 24 tháng kể từ lần liên hệ cuối, hoặc sớm hơn khi bạn yêu cầu] | **Chưa có lịch tự xoá** — xem `docs/privacy/RETENTION_PROPOSAL.vi.md` |
| Email đăng ký bản tin | [CHỜ OWNER: đề xuất đến khi bạn rút lại đồng ý; rà soát 24 tháng một lần] | **Chưa có lịch tự xoá** |
| Sổ ghi nhận yêu cầu của người có dữ liệu (không chứa nội dung dữ liệu) | [CHỜ OWNER: đề xuất 24 tháng] | Quy trình thủ công |

Bản sao lưu của nhà cung cấp cơ sở dữ liệu có thể giữ dữ liệu đã xoá thêm một thời gian ngắn theo chu kỳ sao lưu của họ
**[CHỜ OWNER: kiểm tra chu kỳ sao lưu của gói Supabase đang dùng và điền vào đây]**.

## 8. Chúng tôi bảo vệ dữ liệu thế nào

- Kết nối được mã hoá (HTTPS, bắt buộc HSTS). Trang không thể bị nhúng vào trang khác (chống clickjacking) và có chính sách nội dung (CSP) nghiêm ngặt.
- Biểu mẫu kiểm tra nguồn gửi, định dạng, kích thước, email và sự đồng ý trước khi lưu; có bẫy chống tự động và giới hạn số lần gửi.
- Cơ sở dữ liệu bật kiểm soát truy cập ở mức hàng (RLS); người truy cập website **không** thể đọc hay ghi trực tiếp vào dữ liệu; chỉ chức năng
  máy chủ của VBFA, bằng khoá bí mật không bao giờ nằm trong trình duyệt, được ghi dữ liệu.
- Không có dữ liệu cá nhân trong nhật ký kỹ thuật của ứng dụng.
- Không có biện pháp nào an toàn tuyệt đối. Nếu xảy ra sự cố ảnh hưởng đến dữ liệu của bạn, chúng tôi sẽ thông báo theo quy định
  **[CHỜ PHÁP LÝ: nghĩa vụ và thời hạn thông báo vi phạm dữ liệu]**.

## 9. Quyền của bạn

Bạn có quyền: được biết cách dữ liệu của bạn được xử lý; truy cập và nhận bản sao; yêu cầu chỉnh sửa; yêu cầu xoá; rút lại sự đồng ý
bất cứ lúc nào; hạn chế hoặc phản đối việc xử lý; khiếu nại với cơ quan có thẩm quyền **[CHỜ PHÁP LÝ: đối chiếu danh sách quyền theo luật hiện hành]**.

Cách thực hiện: gửi email tới [CHỜ OWNER: địa chỉ email về dữ liệu] từ **chính địa chỉ email bạn đã dùng khi gửi biểu mẫu**
(để chúng tôi xác minh), nêu rõ yêu cầu. Chúng tôi xác nhận đã nhận trong [CHỜ OWNER: đề xuất 3 ngày làm việc] và xử lý trong thời hạn luật định
**[CHỜ PHÁP LÝ: thời hạn]**. Việc rút lại đồng ý không ảnh hưởng đến tính hợp pháp của việc xử lý trước đó. Quy trình nội bộ: `docs/privacy/DATA_SUBJECT_REQUESTS.vi.md`.

Nếu bạn đăng ký bản tin: [CHỜ OWNER / VẬN HÀNH: nêu cách huỷ đăng ký khi đã chọn công cụ gửi bản tin; website hiện **chưa** gửi bản tin và chưa có liên kết huỷ tự động].

## 10. Trẻ em

Website hướng tới doanh nghiệp, tổ chức và chuyên gia trong ngành, không dành cho trẻ em. Chúng tôi không cố ý thu thập dữ liệu của người dưới
[CHỜ PHÁP LÝ: độ tuổi theo luật hiện hành]. Nếu bạn cho rằng một trẻ em đã gửi dữ liệu cho chúng tôi, hãy liên hệ để chúng tôi xoá.

## 11. Thay đổi chính sách

Khi chính sách thay đổi, chúng tôi cập nhật phiên bản và ngày hiệu lực ở đầu trang. Nếu thay đổi ảnh hưởng đến sự đồng ý đã cho, chúng tôi sẽ xin bạn đồng ý lại
(câu đồng ý trên biểu mẫu được đánh số phiên bản).

## 12. Liên hệ

[CHỜ OWNER: tên bộ phận / người phụ trách dữ liệu cá nhân, email, địa chỉ nhận thư.]
