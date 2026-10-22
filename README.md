# VBFA website

Website của **Hiệp hội Nhiên liệu Sinh học Việt Nam**. Giao diện dựng đúng theo bộ handoff thiết kế (`docs/design/HANDOFF.md`).

| | |
|---|---|
| Frontend | **Astro 7** (xuất tĩnh) trên **Vercel** (CDN) |
| Nội dung | **Sanity** (Studio host riêng tại Sanity, Content Lake, Assets CDN) |
| Biểu mẫu | **Vercel Functions** `/api/join`, `/api/newsletter` → **Supabase PostgreSQL** (`website_leads`) |
| Giám sát | Vercel logs (kỹ thuật, không có dữ liệu khách), tách biệt hoàn toàn với dữ liệu lead |

Đọc: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (kiến trúc, ranh giới dữ liệu, SEO, pop-up) và [`docs/OPERATIONS.md`](docs/OPERATIONS.md) (thiết lập, biến môi trường, danh sách ra mắt).

## Chạy thử

```bash
npm install
npm run dev          # http://localhost:4321 — dùng nội dung seed khi chưa cấu hình Sanity
npm run verify       # astro check + vitest + build + kiểm tra tĩnh
```

Cần Node ≥ 22.23.4 (khuyến nghị 24).

## Trạng thái hiện tại

- Bản **review**: mọi trang có `noindex` và `robots.txt` chặn công cụ tìm kiếm cho tới khi đặt `PUBLIC_SITE_INDEXING=on`.
- Không cấu hình Sanity/Supabase thì website vẫn build và chạy bằng nội dung seed; form trả `503` thay vì mất dữ liệu.
- Nội dung bài 4–10, ngày đăng và ảnh minh hoạ là mẫu. Giấy phép web font SVN-Bebas Neue Pro / SVN-Primark cần xác nhận trước khi ra mắt.
