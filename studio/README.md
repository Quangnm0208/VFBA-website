# VBFA Sanity Studio

Studio biên tập nội dung cho website. **Do Sanity lưu trữ** (`sanity deploy` → `https://<host>.sanity.studio`), không chạy trên Vercel.

```bash
cp .env.example .env          # điền SANITY_STUDIO_PROJECT_ID
npm install
npm run dev                   # http://localhost:3333
npm run validate && npm run typecheck
npm run deploy                # đưa Studio lên *.sanity.studio
```

## Nội dung

| Mục trong Studio | Loại | Ghi chú |
|---|---|---|
| 01 · Nội dung website | Trang chủ, Trang Tin tức, Thông tin chung | mỗi loại chỉ có một tài liệu (không tạo mới/xoá/nhân bản) |
| 02 · Tin tức & góc nhìn | `article` | ảnh bìa bắt buộc có alt; nội dung chỉ dùng kiểu có trong thiết kế |
| 03 · Trang tĩnh | `page` | chính sách bảo mật, điều khoản… tại `/<slug>/` |
| 04 · Pop-up & chiến dịch | `popup` | bật/tắt, trang hiển thị, kích hoạt, tần suất, khung giờ |

Mỗi loại đều có nhóm **SEO** (tiêu đề, mô tả, canonical, ảnh chia sẻ, `noindex`).

## Quy trình xuất bản

1. Soạn bài → **Publish**. Bản nháp không lên website.
2. Webhook gọi Vercel Deploy Hook → website build lại (~1 phút). Thiết lập ở `docs/OPERATIONS.md` §1.D.
3. Nếu dữ liệu không hợp lệ (ví dụ thiếu alt), build báo lỗi rõ ràng và **bản đang chạy không bị ảnh hưởng**.

## Nhập nội dung ban đầu

Từ thư mục gốc: `npm run seed:export` rồi `cd studio && npx sanity dataset import seed/seed.ndjson production --missing`.

## Lưu ý đồng bộ

Schema ở `schemaTypes/` phản chiếu `../src/lib/content/schema.ts` (zod) và truy vấn GROQ ở `../src/lib/content/queries.ts`. Đổi tên trường ở một nơi thì phải đổi ở cả ba; test `src/lib/content/content.test.ts` và bước build của website sẽ báo nếu lệch.
