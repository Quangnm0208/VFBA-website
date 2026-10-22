# Vận hành và đưa vào sử dụng

Mọi thứ dưới đây cần quyền của chủ dự án (tài khoản Sanity, Supabase, Vercel, Cloudflare). Repo **không** chứa khoá bí mật.

## 1. Thứ tự thiết lập

### A. Sanity (nội dung)
1. Tạo project tại sanity.io (tên gợi ý `VBFA`), dataset `production`. Ghi lại **Project ID**.
2. Trong `studio/`: sao chép `studio/.env.example` thành `studio/.env`, điền `SANITY_STUDIO_PROJECT_ID`.
3. `npm run studio:install` rồi `cd studio && npm run deploy` (lần đầu hỏi tên host, ví dụ `vbfa` → `https://vbfa.sanity.studio`). Studio do Sanity lưu trữ, không đi qua Vercel.
4. Mời biên tập viên: sanity.io/manage → project → Members (vai trò *Editor*; *Administrator* chỉ cho người quản trị).
5. Nhập nội dung ban đầu (giống hệt website hiện tại):
   ```bash
   npm run seed:export          # tạo studio/seed/seed.ndjson từ nội dung seed
   cd studio && npx sanity dataset import seed/seed.ndjson production --missing
   ```
   `--missing` chỉ tạo tài liệu chưa có, chạy lại không ghi đè nội dung đã sửa. Ảnh minh hoạ được upload lên Assets CDN.
6. Trong Studio: mở *Thông tin chung → Biểu mẫu*, rà soát **câu đồng ý** với bộ phận pháp lý; tạo trang tĩnh *Chính sách bảo mật* và chọn nó ở trường "Trang Chính sách bảo mật" (câu đồng ý sẽ tự có liên kết).

### B. Supabase (lead)
1. Tạo project **riêng cho VBFA**, vùng gần Việt Nam (ví dụ Singapore `ap-southeast-1`, khớp vùng Function `sin1` trong `vercel.json`).
2. Chạy `supabase/migrations/0001_website_leads.sql` (SQL Editor hoặc `supabase db push`). Kiểm tra: Table Editor → `website_leads` có nhãn **RLS enabled**, không có policy.
3. Lấy `Project URL` và khoá **service_role** (Settings → API). Khoá này bỏ qua RLS: chỉ đặt trong biến môi trường Vercel, không bao giờ dán vào chat/commit/client.
4. Lên lịch xoá dấu vết rate-limit (khuyến nghị mỗi ngày): `select public.purge_lead_metadata();` bằng `pg_cron` hoặc Supabase Scheduled Function.

### C. Cloudflare Turnstile (khuyến nghị)
Tạo widget (Managed) cho domain website → lấy **Site key** và **Secret key**. Form hội viên sẽ hiện widget khi có `PUBLIC_TURNSTILE_SITE_KEY` và server bắt buộc token khi có `TURNSTILE_SECRET_KEY`.

### D. Vercel
1. Project `vfba-website` (Settings → Environment Variables), theo bảng mục 2.
2. Settings → Git → **Deploy Hooks** → tạo hook cho nhánh `main` (tên `sanity-publish`), sao chép URL.
3. Sanity: manage → API → **Webhooks** → Create: URL = Deploy Hook ở trên; Dataset `production`; Trigger on *Create, Update, Delete*; **tắt** "Include drafts"; Filter: `_type in ["article","page","homePage","newsPage","siteSettings","popup"]`; Method `POST`. Từ giờ mỗi lần *Publish* sẽ tự build lại.
4. (Tuỳ chọn) Vercel → Observability / Log Drains để chuyển log kỹ thuật sang công cụ giám sát.

## 2. Biến môi trường

| Biến | Môi trường | Bí mật | Mục đích |
|---|---|---|---|
| `PUBLIC_SITE_URL` | Production | không | Origin chính thức (canonical, OG, sitemap). Bỏ trống ở Preview |
| `PUBLIC_SITE_INDEXING` | Production | không | `off` (mặc định) chặn công cụ tìm kiếm. Đặt `on` khi ra mắt |
| `PUBLIC_SANITY_PROJECT_ID` | Preview + Production | không | Bật đọc nội dung từ Sanity. Bỏ trống = dùng nội dung seed |
| `PUBLIC_SANITY_DATASET` | Preview + Production | không | Mặc định `production` |
| `SANITY_API_READ_TOKEN` | Preview + Production | **có** | Chỉ khi dataset ở chế độ private |
| `SUPABASE_URL` | Preview + Production | có | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Production (Preview tuỳ chọn) | **có** | Ghi lead (chỉ Function đọc) |
| `IP_HASH_SALT` | Production | **có** | Muối băm IP cho giới hạn tốc độ (`openssl rand -hex 32`) |
| `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Production | secret: có | Chống spam |
| `FORM_ALLOWED_ORIGINS` | Production | không | Origin bổ sung được phép POST (vd. domain mới khi chuyển đổi) |
| `ENABLE_VERCEL_ANALYTICS` | Production | không | `true` bật Web Analytics không cookie |

Preview **không** nên có `SUPABASE_SERVICE_ROLE_KEY`: form ở preview sẽ trả `503` thay vì ghi vào dữ liệu thật. Đây là hành vi mong muốn.

## 3. Danh sách kiểm tra trước khi ra mắt

- [ ] Nội dung, ảnh, thông tin liên hệ và câu đồng ý được chủ dự án duyệt (nội dung mẫu bài 4–10 đã thay bằng nội dung thật; ảnh minh hoạ thay bằng ảnh có bản quyền rõ ràng).
- [ ] Trang *Chính sách bảo mật* đã xuất bản và được liên kết từ biểu mẫu.
- [ ] Giấy phép web font **SVN-Bebas Neue Pro** và **SVN-Primark** đã xác nhận (xem `docs/design/HANDOFF.md`, Open items). Nếu không được phép: thay bằng Bebas Neue và một font viết tay tương tự trong `astro.config.ts`.
- [ ] Domain đã trỏ về Vercel; `PUBLIC_SITE_URL` = domain chính thức.
- [ ] Gửi thử form hội viên và bản tin trên bản production → có hàng mới trong `website_leads`; gửi lại cùng email bản tin không tạo hàng thứ hai.
- [ ] Turnstile bật; thử gửi nhanh liên tiếp để thấy giới hạn tốc độ.
- [ ] Đặt `PUBLIC_SITE_INDEXING=on` → build lại → kiểm tra `robots.txt` có `Sitemap:` và các trang không còn `noindex`; gửi `sitemap.xml` cho Google Search Console.
- [ ] Lighthouse (di động) trên URL production: Performance / Accessibility / SEO.
- [ ] Đã thử trên thiết bị thật (iOS Safari, Android Chrome) và bằng trình đọc màn hình.

## 4. Chạy cục bộ

Yêu cầu Node ≥ 22.23.4 (khuyến nghị 24, xem `.nvmrc`).

```bash
npm install
npm run dev                 # http://localhost:4321 (nội dung seed nếu chưa có Sanity)
npm run verify              # type check + test + build + kiểm tra tĩnh
npm run build && npm run qa:serve   # (cửa sổ khác) rồi: npm run qa:e2e   (cần: npx playwright install chromium)
```

Chạy form thật khi phát triển: tạo `.env` từ `.env.example` và điền Supabase; không có Supabase thì `/api/*` trả `503` (đúng thiết kế).

## 5. Giám sát và xử lý sự cố

| Việc | Nhìn ở đâu |
|---|---|
| Form không gửi được | Vercel → Logs → lọc `event: lead.*`. Mã: `lead.not_configured` (thiếu biến), `lead.store_failed` (Supabase), `lead.rate_limited`, `lead.captcha_failed`, `lead.origin_rejected`, `lead.dropped` (bot) |
| Build lỗi sau khi Publish | Vercel → Deployments → log build: thông báo `Invalid article "…" from Sanity` chỉ rõ trường sai. Bản cũ vẫn đang chạy |
| Nội dung chưa cập nhật | Kiểm tra webhook Sanity đã gọi Deploy Hook (manage.sanity.io → API → Webhooks → Attempts) |
| Hiệu năng thật | Vercel Speed Insights (nếu bật) hoặc Lighthouse |
| Xoá dữ liệu theo yêu cầu của khách | Supabase → `website_leads` → xoá hàng theo email (hoặc đổi `status = 'deleted'` rồi xoá định kỳ) |

**Quay lại bản trước**: Vercel → Deployments → chọn bản tốt → *Promote to Production* (hoặc Instant Rollback).
