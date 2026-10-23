# Đề xuất thời hạn lưu giữ dữ liệu lead (để Owner và pháp lý quyết định)

> Đây là **đề xuất vận hành/kỹ thuật**, không phải quyết định pháp lý. Chưa có gì trong đề xuất này được cài vào cơ sở dữ liệu.
> Một lịch **xoá dữ liệu** là thay đổi không hoàn tác: chỉ cài sau khi Owner duyệt số liệu bên dưới (quy tắc của dự án: migration phá hủy dữ liệu cần phê duyệt).

## 1. Hiện trạng đã cài đặt và đã kiểm chứng

| Dữ liệu | Thời hạn | Cơ chế | Bằng chứng |
|---|---|---|---|
| `ip_hash` trên hàng lead | 30 ngày (đặt NULL) | `public.purge_lead_metadata()` do pg_cron `vbfa-purge-lead-metadata`, 03:17 UTC hằng ngày | `docs/evidence/SUPABASE_REAL_2026-10-22.md` (job đã đăng ký; lần chạy đầu `succeeded` lúc 2026-10-23 03:17:00 UTC, `runid 1`) |
| Bộ đếm `form_attempts` | 2 ngày (xoá hàng) | cùng hàm | như trên |
| Hàng lead (họ tên, email, tổ chức...) | **không bao giờ tự xoá** | — | khoảng trống cần quyết định |

## 2. Thời hạn đề xuất cho hàng lead

| Loại | Đề xuất | Lý do |
|---|---|---|
| Liên hệ / quan tâm hội viên | **24 tháng kể từ lần tương tác cuối** (lần gửi biểu mẫu hoặc lần VBFA phản hồi gần nhất); xoá sớm hơn khi có yêu cầu | đủ cho một chu kỳ tuyển hội viên; không giữ vô thời hạn dữ liệu của người không trở thành hội viên |
| Đăng ký bản tin | **đến khi rút lại đồng ý**; nếu 24 tháng không có tương tác (mở/nhấp) thì xoá hoặc xin xác nhận lại | cơ sở là sự đồng ý; đồng ý cũ không nên kéo dài mãi |
| Người đã trở thành hội viên | chuyển sang hồ sơ hội viên do VBFA quản lý ngoài hệ thống này, rồi xoá khỏi bảng lead | hồ sơ hội viên có cơ sở và thời hạn riêng **[CHỜ PHÁP LÝ]** |
| Sổ yêu cầu của người có dữ liệu | 24 tháng | để chứng minh đã đáp ứng yêu cầu; sổ không chứa nội dung dữ liệu |

Các số 24 tháng là **đề xuất khởi điểm**; Owner/pháp lý có thể chọn số khác (kể cả để phù hợp một thời hiệu hay quy định ngành). Nếu chọn số khác, chỉ cần đổi tham số bên dưới.

## 3. Cách cài đặt sau khi được duyệt (chưa áp dụng)

Migration mới `0007_purge_expired_leads` (một file, có thể hoàn tác về mặt chương trình bằng cách bỏ lịch; **dữ liệu đã xoá thì không khôi phục**, trừ khi dùng sao lưu của nhà cung cấp):

```sql
-- BẢN NHÁP, CHƯA ÁP DỤNG. Tham số: p_membership_months, p_newsletter_months.
create or replace function public.purge_expired_leads(p_membership_months int default 24, p_newsletter_months int default 24, p_dry_run boolean default true)
returns table (kind text, expired bigint)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    select l.kind::text, count(*)::bigint
    from public.website_leads l
    where (l.kind = 'membership' and l.created_at < now() - make_interval(months => p_membership_months))
       or (l.kind = 'newsletter' and l.created_at < now() - make_interval(months => p_newsletter_months))
    group by l.kind;
  if not p_dry_run then
    delete from public.website_leads l
    where (l.kind = 'membership' and l.created_at < now() - make_interval(months => p_membership_months))
       or (l.kind = 'newsletter' and l.created_at < now() - make_interval(months => p_newsletter_months));
  end if;
end $$;
revoke all on function public.purge_expired_leads(int, int, boolean) from public, anon, authenticated;
```

Lưu ý khi viết bản thật:

- `created_at` chỉ là mốc "ngày nhận". "Tương tác cuối" (VBFA đã phản hồi) hiện **không có cột** trong bảng; nếu muốn tính từ lần phản hồi cuối thì cần thêm cột
  `last_contacted_at` và quy trình cập nhật — hoặc chấp nhận mốc `created_at` (đơn giản, an toàn hơn cho bên có dữ liệu).
- Chạy `p_dry_run => true` trước một thời gian và gửi số lượng cho Owner; chỉ chuyển sang xoá thật sau khi Owner đồng ý bằng văn bản.
- Lên lịch pg_cron hằng tuần; sau mỗi lần chạy, ghi số hàng đã xoá vào sổ vận hành (không ghi nội dung).
- Hàm phải có test trong `supabase/migrations.test.ts` (PGlite) và vân tay schema (`supabase/fingerprint.sql`) phải được cập nhật cùng lúc trên bản thật và bản dựng từ migration.
- Quyền: chỉ `service_role`/chủ sở hữu cron gọi được (như `purge_lead_metadata`).

## 4. Quyết định cần từ Owner / pháp lý

1. Số tháng cho từng loại (mục 2).
2. Mốc tính: `created_at` hay "tương tác cuối".
3. Có cần thông báo trước cho người sắp bị xoá hay không.
4. Chu kỳ sao lưu của gói Supabase đang dùng, để ghi đúng vào Chính sách bảo mật (dữ liệu đã xoá còn trong sao lưu bao lâu).

## 5. Dữ liệu do CRM tạo thêm (cần Owner quyết cùng các số ở mục 2)

| Dữ liệu | Hiện trạng | Đề xuất |
|---|---|---|
| Ghi chú nội bộ (`lead_notes`) | xoá cùng hàng lead (cascade); không tự xoá | theo thời hạn của hàng lead (mục 2) |
| Nhật ký thao tác (`crm_audit_log`) | không tự xoá; **không chứa dữ liệu cá nhân của khách** | giữ **12 tháng** (đủ để điều tra sự cố/lạm quyền), rồi xoá hoặc lưu trữ; thêm hàm xoá có `p_dry_run` như mục 3 |
| Bộ đếm đăng nhập (`crm_login_attempts`) | tự xoá hàng cũ hơn **1 ngày** mỗi lần có lượt đăng nhập | giữ nguyên |
| Danh sách nhân sự (`crm_staff`) | vô hiệu hoá không xoá hàng | xoá hàng của người đã nghỉ sau khi hết nghĩa vụ lưu nhật ký |

Quyết định cần từ Owner / pháp lý (bổ sung mục 4): thời hạn nhật ký thao tác; ai được xem nhật ký; có cần ghi nhận việc **xem** khách (hiện đã ghi `lead_view`) hay chỉ ghi thay đổi.

