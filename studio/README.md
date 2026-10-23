# VBFA Sanity Studio và Admin Portal

Studio biên tập nội dung cho website **và** Cổng quản trị (công cụ *Quản lý Lead* / *Quản trị nhân sự* của CRM trong cùng một địa chỉ). Hai nơi chạy:

- **Cổng quản trị** — project Vercel `vbfa-admin` (Root Directory `studio`): Studio + Lead + Nhân sự, một lần đăng nhập Sanity. Kiến trúc, triển khai, rủi ro: `../docs/ADMIN_PORTAL.vi.md`; các bước tạo project (Owner): `../docs/OWNER_SETUP_GUIDE.vi.md` Bước 8.
- **Bản dự phòng chỉ-nội-dung** — `sanity deploy` → `https://<host>.sanity.studio` (công cụ Lead ở đó báo "chỉ có ở Cổng quản trị").

```bash
cp .env.example .env          # điền SANITY_STUDIO_PROJECT_ID
npm ci
npm run dev                   # http://localhost:3333 (công cụ Lead cần /api/portal: chỉ có khi triển khai)
npm run validate && npm run typecheck
npm run build                 # sanity build + .vercel/output (Build Output API: Studio tĩnh + function /api/portal)
node scripts/check-vercel-output.mjs   # kiểm tra cây output, header, định tuyến, không lộ tên phía máy chủ
npm run deploy                # bản dự phòng lên *.sanity.studio
```

Cấu trúc: `portal/` màn hình Lead/Nhân sự (React, @sanity/ui), `portal-api/portal.ts` function, `scripts/` đóng gói + Build Output API. Mã dùng chung của function nằm ở `../src/lib/server/crm/portal` (cần "Include source files outside of the Root Directory" trên Vercel). Kiểm thử trình duyệt: `node scripts/qa/portal-browser.mjs` từ thư mục gốc.

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
