# VBFA website

Website của **Hiệp hội Nhiên liệu Sinh học Việt Nam**. Giao diện dựng đúng theo bộ handoff thiết kế (`docs/design/HANDOFF.md`).

| | |
|---|---|
| Frontend | **Astro 7** (xuất tĩnh) trên **Vercel** (CDN) |
| Nội dung | **Sanity** (Studio host riêng tại Sanity, Content Lake, Assets CDN) |
| Biểu mẫu | **Vercel Functions** `/api/join`, `/api/newsletter` → **Supabase PostgreSQL** (`website_leads`) |
| Giám sát | Vercel logs (kỹ thuật, không có dữ liệu khách), tách biệt hoàn toàn với dữ liệu lead |

Đọc: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (kiến trúc, ranh giới dữ liệu, SEO, pop-up) [`docs/OPERATIONS.md`](docs/OPERATIONS.md) (thiết lập, biến môi trường, danh sách ra mắt) [`docs/QA.md`](docs/QA.md) (các bộ kiểm thử, điều kiện đo, kết quả Core Web Vitals/responsive, giới hạn) và [`docs/RELEASE.md`](docs/RELEASE.md) (hiện trạng production/rollback, cổng go/no-go, đăng ký nội dung, font và pháp lý).

## Chạy thử

```bash
npm install
npm run dev          # http://localhost:4321 — dùng nội dung seed khi chưa cấu hình Sanity
npm run verify       # astro check + vitest + build + kiểm tra tĩnh
```

Cần Node 24 (xem `.nvmrc`; tối thiểu 22.23.4 để chạy cục bộ).

## Trạng thái hiện tại

- Bản **review**: mọi trang có `noindex` và `robots.txt` chặn công cụ tìm kiếm cho tới khi đặt `PUBLIC_SITE_INDEXING=on`.
- Không cấu hình Sanity/Supabase thì website vẫn build và chạy bằng nội dung seed; form trả `503` thay vì mất dữ liệu.
- Nội dung bài 4–10, ngày đăng và ảnh minh hoạ là mẫu. Font SVN-Bebas Neue Pro / SVN-Primark (giấy phép web chưa xác nhận) **đã bị loại khỏi mã nguồn**, thay bằng Barlow Condensed / Dancing Script (SIL OFL) — xem `docs/design/FONTS.md`; Marketing cần duyệt lại hiển thị nhãn và câu viết tay.
