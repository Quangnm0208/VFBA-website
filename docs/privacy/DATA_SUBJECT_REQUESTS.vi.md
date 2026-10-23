# Quy trình xử lý yêu cầu của người có dữ liệu (truy cập, chỉnh sửa, xoá, rút lại đồng ý)

> Quy trình **vận hành** để Owner duyệt. Thời hạn trả lời luật định do pháp lý xác nhận **[CHỜ PHÁP LÝ]**; số ngày dưới đây là mục tiêu nội bộ đề xuất.
> Công cụ: SQL Editor của dự án Supabase `bzrtllytykldnawbuszu` (hoặc `service_role` qua kết nối server). Không có giao diện nào của website đọc/ghi dữ liệu này.

## 0. Vai trò

| Vai trò | Việc | Ai |
|---|---|---|
| Tiếp nhận | đọc hộp thư dữ liệu cá nhân, mở một dòng trong sổ yêu cầu | [CHỜ OWNER: tên] |
| Thực hiện | chạy SQL bên dưới, ghi kết quả | [CHỜ OWNER: tên; tối đa 2 người có quyền truy cập SQL Editor] |
| Duyệt | xác nhận yêu cầu xoá hợp lệ trước khi chạy `delete` | [CHỜ OWNER: tên] |

## 1. Tiếp nhận (ngày 0)

1. Yêu cầu đến hộp thư dữ liệu (mục 1 của Chính sách bảo mật). Mở một dòng trong **sổ yêu cầu** (bảng tính nằm ngoài cơ sở dữ liệu):
   mã yêu cầu, ngày nhận, loại (truy cập / chỉnh sửa / xoá / rút lại đồng ý bản tin), trạng thái. **Không ghi nội dung dữ liệu cá nhân vào sổ**.
2. Gửi xác nhận đã nhận trong **3 ngày làm việc** (đề xuất).

## 2. Xác minh danh tính

- Yêu cầu phải đến **từ chính địa chỉ email đã gửi biểu mẫu**. Nếu đến từ địa chỉ khác, trả lời tới địa chỉ email trong hệ thống (không phải địa chỉ gửi yêu cầu)
  để xác nhận trước khi làm gì.
- Với hàng hội viên, có thể hỏi thêm tên tổ chức đã khai. Không yêu cầu giấy tờ tuỳ thân nếu không cần thiết (tránh thu thêm dữ liệu).

## 3. Tìm bản ghi (chỉ đọc)

```sql
select id, kind, created_at, consent_text_version, source_path
from public.website_leads
where lower(email) = lower('<email đã xác minh>')
order by created_at;
```

Ghi vào sổ **số hàng tìm thấy** (không ghi nội dung).

## 4. Theo loại yêu cầu

**Truy cập / bản sao.** Xuất các cột người dùng đã cung cấp và siêu dữ liệu đã lưu, gửi tới địa chỉ email đã xác minh bằng kênh an toàn:

```sql
select kind, name, company, email, phone, interest, message, consent, consent_text_version, consent_at, created_at
from public.website_leads
where lower(email) = lower('<email đã xác minh>');
```

(`ip_hash` không cần gửi: là mã băm một chiều và tự bị xoá sau 30 ngày.)

**Chỉnh sửa.**

```sql
begin;
update public.website_leads set name = '<giá trị mới>' where lower(email) = lower('<email đã xác minh>') and kind = 'membership' returning id;
-- kiểm tra số hàng trả về = số hàng mong đợi, rồi:
commit;
```

**Xoá / rút lại đồng ý bản tin / rút lại đồng ý liên hệ.**

```sql
begin;
delete from public.website_leads where lower(email) = lower('<email đã xác minh>') returning id, kind;
-- Số hàng trả về phải khớp với bước 3. Nếu khác ⇒ rollback; và tìm hiểu trước khi làm tiếp.
commit;
```

Khi có CRM: xoá hàng `website_leads` cũng **xoá ghi chú nội bộ** của khách (`lead_notes`, cascade). Nhật ký thao tác (`crm_audit_log`) chỉ còn id khách, trạng thái và email nhân sự, không có dữ liệu của khách. Nếu chỉ cần ẩn khỏi CRM trước khi xoá hẳn: `update public.website_leads set status = 'deleted' where id = '<id>';` (CRM không hiển thị hàng `deleted`).

Lựa chọn khác cho **rút lại đồng ý bản tin** (không xoá hàng): `update public.website_leads set status = 'unsubscribed' where lower(email) = lower('<email đã xác minh>') and kind = 'newsletter' returning id;`
— giữ lại một dấu vết tối thiểu để không thêm lại địa chỉ đó vào danh sách gửi. Giữ hay xoá hẳn là **[CHỜ PHÁP LÝ]**; nếu người dùng yêu cầu **xoá**, luôn xoá hàng.

Sau khi xoá:

1. Nếu đã có công cụ gửi bản tin: **gỡ địa chỉ khỏi công cụ đó** (xoá ở đây không tự gỡ ở đó) **[CHỜ VẬN HÀNH: công cụ]**.
2. Nếu địa chỉ có trong hồ sơ hội viên, bảng tính hay hộp thư riêng của VBFA, xoá/ẩn theo thời hạn riêng của chúng **[CHỜ PHÁP LÝ]**.
3. Bản sao lưu của nhà cung cấp cơ sở dữ liệu có thể còn dữ liệu đến hết chu kỳ sao lưu: nói rõ điều này khi trả lời nếu người yêu cầu hỏi.

## 5. Hoàn tất và trả lời

- Trả lời người yêu cầu, nêu việc đã làm (không đính kèm dữ liệu của người khác).
- Hoàn tất trong **thời hạn luật định [CHỜ PHÁP LÝ]**; mục tiêu nội bộ đề xuất: 15 ngày làm việc. Nếu cần lâu hơn, báo lý do cho người yêu cầu.
- Cập nhật sổ: ngày hoàn tất, người thực hiện, số hàng bị tác động, ghi chú. Giữ sổ **24 tháng** (đề xuất).

## 6. Kiểm tra định kỳ

- Hằng quý: kiểm tra các yêu cầu còn mở, và việc `purge_lead_metadata()` đã chạy (`select * from cron.job_run_details where jobid in (select jobid from cron.job where jobname = 'vbfa-purge-lead-metadata') order by start_time desc limit 5;`).
- Mỗi lần đổi nhà cung cấp hay thêm một bên xử lý mới: cập nhật `DATA_MAP.md` và Chính sách bảo mật trước khi bật.

## 7. Thử quy trình (không dùng dữ liệu thật)

Dùng bản ghi của kịch bản `scripts/qa/live-e2e.mjs` (email dạng `e2e-…@example.invalid`): chạy bước 3 và 4 với một email thử trên Preview đã bật `LEADS_ENABLED=true`,
xác nhận `returning` trả đúng số hàng, rồi `select count(*)` bằng 0.
