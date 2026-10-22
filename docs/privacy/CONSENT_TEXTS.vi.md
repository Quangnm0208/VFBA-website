# Sổ phiên bản câu đồng ý (consent registry)

Mỗi hàng lead lưu `consent_text_version` (ví dụ `join-v2`). Con số đó chỉ có giá trị chứng minh nếu **nội dung chính xác của phiên bản đó**
còn được lưu ở đâu đó. File này là nơi lưu, **chỉ thêm, không sửa chữ của phiên bản đã dùng**. Trạng thái "đã duyệt" chỉ do Owner / pháp lý ghi.

## Quy tắc chung (áp dụng cho cả hai biểu mẫu)

1. Câu đồng ý **luôn nằm cạnh một ô tích riêng, không tích sẵn**, bắt buộc để gửi (`required`); máy chủ từ chối `consent:false` (HTTP 400).
2. Nội dung và phiên bản nằm trong Studio → Thông tin chung → Biểu mẫu: hội viên (`consentText` + `consentVersion` = `join-v<số>`),
   bản tin (`newsletterConsentText` + `newsletterConsentVersion` = `newsletter-v<số>`). Cả hai được hiển thị trong **cùng một lần build**, nên phiên bản lưu
   vào hàng lead luôn là phiên bản người dùng đã thấy.
3. Sửa dù chỉ một chữ ⇒ **tăng số phiên bản** (join-v3, newsletter-v2...) và thêm một mục vào bảng dưới **trước khi** Publish.
4. Cả hai câu đều có liên kết "Chính sách bảo mật" khi trang chính sách đã được chọn trong Studio (xem `PRIVACY_POLICY_DRAFT.vi.md`).
5. Máy chủ chỉ chấp nhận phiên bản có dạng `join-v<số>` cho biểu mẫu hội viên và `newsletter-v<số>` cho bản tin; thiếu hoặc sai dạng ⇒ 400 và không lưu.

## Các phiên bản

| Phiên bản | Biểu mẫu | Nội dung | Trạng thái | Dùng từ |
|---|---|---|---|---|
| `join-v2` | hội viên | Tôi đồng ý để VBFA sử dụng thông tin này nhằm liên hệ và phản hồi yêu cầu của tôi. | **Giữ chỗ (placeholder), CHƯA được pháp lý duyệt.** Đang là mặc định trong mã; chưa có hàng lead thật nào (`LEADS_ENABLED` chưa bật trên Production). | build đầu tiên |
| `newsletter-v1` | bản tin | Tôi đồng ý nhận bản tin VBFA qua email và cho phép xử lý địa chỉ email để gửi bản tin. | **Giữ chỗ, CHƯA được duyệt.** | PR #7 |
| `join-v3` | hội viên | *(đề xuất bên dưới)* | **ĐỀ XUẤT, chờ Owner / pháp lý** | — |
| `newsletter-v2` | bản tin | *(đề xuất bên dưới)* | **ĐỀ XUẤT, chờ Owner / pháp lý** | — |

## Đề xuất cho pháp lý duyệt (chưa có trên website)

Mục tiêu: hai câu cùng cấu trúc — *ai xử lý, dữ liệu gì, để làm gì, liên kết chính sách, quyền rút lại* — và ngắn đủ để đứng cạnh ô tích.
Chữ in nghiêng là chỗ chờ thông tin của Owner.

**join-v3 (hội viên)**

> Tôi đồng ý để *[tên pháp lý của VBFA]* xử lý họ tên, tổ chức, email, số điện thoại (nếu có) và nội dung tôi nhập để liên hệ và phản hồi yêu cầu kết nối / quan tâm hội viên của tôi, theo Chính sách bảo mật. Tôi có thể rút lại đồng ý bất cứ lúc nào bằng cách liên hệ *[email về dữ liệu]*.

**newsletter-v2 (bản tin)**

> Tôi đồng ý nhận bản tin của *[tên pháp lý của VBFA]* qua email và để VBFA xử lý địa chỉ email của tôi cho mục đích này, theo Chính sách bảo mật. Tôi có thể huỷ đăng ký bất cứ lúc nào *[cách huỷ: liên kết trong email / liên hệ ...]*.

Điều kiện kỹ thuật để dùng hai câu trên: (a) trang Chính sách bảo mật đã duyệt và được chọn trong Studio; (b) Owner đã điền các chỗ *[...]*;
(c) với bản tin: đã có công cụ gửi bản tin hỗ trợ huỷ đăng ký (website hiện không gửi bản tin).

## Cách đưa một phiên bản mới lên (sau khi Owner duyệt)

1. Thêm mục vào bảng trên (trạng thái "Đã duyệt bởi <tên>, ngày <ngày>").
2. Studio → Thông tin chung → Biểu mẫu: dán câu mới và đổi phiên bản → Publish.
3. Webhook (hoặc redeploy) → kiểm tra trên Preview: ô tích hiển thị câu mới, `data-consent-version` đúng.
4. Chạy `VBFA Preview real-service E2E` (kịch bản dùng phiên bản trong mã cho dữ liệu thử; hàng thật sẽ lưu phiên bản mới).
