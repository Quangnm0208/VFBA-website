# Vận hành và đưa vào sử dụng

Mọi thứ dưới đây cần quyền của chủ dự án (tài khoản Sanity, Supabase, Vercel, Cloudflare). Repo **không** chứa khoá bí mật.

## 1. Thứ tự thiết lập

### A. Sanity (nội dung)
1. Tạo project tại sanity.io (tên gợi ý `VBFA`), dataset `production`. Ghi lại **Project ID**.
2. Ở thư mục gốc repo chạy `npm install` (Studio dùng chung `tsconfig.json` gốc nên cần cài cả hai nơi; thiếu bước này `sanity` báo `Tsconfig not found astro/tsconfigs/strict`). Trong `studio/`: sao chép `studio/.env.example` thành `studio/.env`, điền `SANITY_STUDIO_PROJECT_ID`.
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
2. Chạy lần lượt `supabase/migrations/0001_website_leads.sql` và `0002_form_throttle.sql` (SQL Editor hoặc `supabase db push`). Kiểm tra: Table Editor → `website_leads` và `form_attempts` đều có nhãn **RLS enabled**, không có policy; Database → Functions có `register_attempt` và `purge_lead_metadata`.
3. Lấy `Project URL` và khoá **service_role** (Settings → API). Khoá này bỏ qua RLS: chỉ đặt trong biến môi trường Vercel, không bao giờ dán vào chat/commit/client.
4. Dọn dẹp dữ liệu giới hạn tốc độ mỗi ngày: bật extension **pg_cron** (Database → Extensions) **trước** khi chạy `0002` thì migration tự lên lịch `vbfa-purge-lead-metadata` lúc 03:17 UTC. Nếu bật sau, chạy lại đoạn `do $cron$ … $cron$` cuối `0002`, hoặc lên lịch `select public.purge_lead_metadata();` bằng Supabase Scheduled Function. Hàm xoá hash địa chỉ trên lead sau 30 ngày và bộ đếm sau 2 ngày. Kiểm tra: `select * from cron.job where jobname = 'vbfa-purge-lead-metadata';`
5. Xác minh quyền: bằng khoá **anon** (Settings → API) gọi `GET /rest/v1/website_leads` và `/rest/v1/form_attempts` phải trả `401/403` hoặc mảng rỗng không có dữ liệu, và `POST /rest/v1/rpc/register_attempt` phải bị từ chối.
6. Yêu cầu truy cập/xoá dữ liệu của khách: tìm theo email (`select * from public.website_leads where lower(email) = lower('…')`), xoá bằng `delete from public.website_leads where lower(email) = lower('…')`. Bộ đếm `form_attempts` không chứa dữ liệu cá nhân. Thời hạn lưu giữ lead do chủ dự án và bộ phận pháp lý quyết định (chưa có trong code).

### C. Cloudflare Turnstile (khuyến nghị)
Tạo widget (Managed) cho domain website → lấy **Site key** và **Secret key**. Cả form hội viên và form bản tin sẽ hiện widget khi có `PUBLIC_TURNSTILE_SITE_KEY` (bản tin ở chế độ vô hình, nạp khi người dùng bắt đầu nhập) và server bắt buộc token cho cả hai khi có `TURNSTILE_SECRET_KEY`. Thêm mọi hostname sẽ dùng (domain chính thức, `*.vercel.app` của bản Preview cần test) vào danh sách **Hostname** của widget; khi gắn tên miền riêng, cập nhật danh sách này trước khi chuyển DNS.

### D. Vercel
1. Project `vfba-website` (Settings → Environment Variables), theo bảng mục 2.
2. Settings → Git → **Deploy Hooks** → tạo hook cho nhánh `main` (tên `sanity-publish`), sao chép URL.
3. Sanity: manage → API → **Webhooks** → Create: URL = Deploy Hook ở trên; Dataset `production`; Trigger on *Create, Update, Delete*; **tắt** "Include drafts"; Filter: `_type in ["article","page","homePage","newsPage","siteSettings","popup"]`; Method `POST`. Từ giờ mỗi lần *Publish* sẽ tự build lại.
4. (Tuỳ chọn) Vercel → Observability / Log Drains để chuyển log kỹ thuật sang công cụ giám sát.

### E. Kiểm thử Sanity sau khi kích hoạt (làm trên Preview trước, ghi kết quả vào biên bản)

Điều kiện: đã có Project ID, Studio đã `deploy`, `PUBLIC_SANITY_PROJECT_ID` đặt ở **Preview** (không đặt ở Production cho tới khi bước 1–5 đạt), webhook trỏ tới một Deploy Hook của nhánh thử chứ chưa phải `main`.

1. **Gói và vai trò (không giả định).** Mở manage.sanity.io → project → Members/Billing và ghi lại: gói đang dùng, vai trò thực tế của từng biên tập viên. Biên tập viên cần vai trò *Editor* (sửa + xuất bản); nếu gói hiện tại không cấp được vai trò này thì **dừng và xin chủ dự án phê duyệt** trước khi nâng gói trả phí. Không nâng gói khi chưa có chấp thuận.
2. **Dữ liệu ban đầu.** Sau `seed:export` + `dataset import --missing`, Studio hiển thị 3 tài liệu đơn (Trang chủ, Trang Tin tức, Thông tin chung) và 10 bài; build Preview ra trang giống hệt bản seed.
3. **Publish.** Sửa tiêu đề một bài → *Publish* → trong vài phút Vercel có deployment mới (nguồn: webhook, không phải commit) → trang bài và `/tin-tuc/` đổi tiêu đề, `sitemap.xml` giữ nguyên số URL.
4. **Unpublish / xoá.** *Unpublish* một bài → webhook ở mục Attempts có lượt **Delete** → deployment mới không còn trang bài đó (URL trả 404 có CSP) và bài biến khỏi `/tin-tuc/`, trang chủ, `search-index.json`. Nếu webhook không bắn khi Delete, kiểm tra bộ lọc GROQ và tắt/bật "Include drafts" (phải tắt).
5. **Nội dung sai phải không lên được.** Studio chặn phần lớn lỗi ngay khi nhập; lớp bảo vệ thứ hai là kiểm tra `zod` lúc build (`src/lib/content/schema.ts`), dành cho nội dung đi vòng qua Studio (import, API). Trong dataset thử, tạo bằng `sanity dataset import`/`sanity documents create` một bài có `slug` viết hoa (hoặc `title` ngắn hơn 8 ký tự) → build **thất bại** với thông báo `Invalid article "…"`, deployment đang chạy không đổi (Vercel không chuyển bản lỗi sang production). Sửa nội dung → build lại → thành công. Lưu ý: bài **không có** `slug` bị truy vấn bỏ qua im lặng (không gây lỗi build).
6. **Bộ lọc webhook luôn khớp schema.** `scripts/webhook-filter.test.mjs` (chạy trong `npm test`) so danh sách loại tài liệu trong Studio với bộ lọc ở mục D.3 và với mọi truy vấn của website; thêm loại tài liệu mới mà quên cập nhật bộ lọc sẽ làm CI đỏ.
7. **Đặt lịch xuất bản.** Website là tĩnh: bài có "Ngày hiển thị" ở tương lai **chưa** hiện cho tới lần build kế tiếp sau thời điểm đó (không có lần build nào tự chạy). Hoặc đặt ngày hiện tại, hoặc nhờ người quản trị gọi Deploy Hook đúng giờ; nếu cần tự động, tạo một lịch (ví dụ GitHub Actions `schedule` gọi Deploy Hook lưu như secret) — chưa bật vì thêm hạ tầng, cần chủ dự án quyết định.
8. **Quyền đọc.** Trình duyệt không bao giờ gọi Sanity (CSP `connect-src 'self'`): không cần cấu hình CORS cho website. Ảnh đến từ `cdn.sanity.io` (đã nằm trong `img-src`). Dataset công khai không cần `SANITY_API_READ_TOKEN`; nếu đặt dataset ở chế độ private thì đặt token đọc (Viewer) làm secret.

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
| `IP_HASH_SALT` | Production | **có** | Muối băm IP cho giới hạn tốc độ (`openssl rand -hex 32`). **Bắt buộc**: thiếu thì form trả 503 (không còn dùng service-role key thay thế) |
| `LEADS_ENABLED` | Production | **có** | Công tắc ra mắt thu thập dữ liệu cá nhân: chỉ đặt `true` **sau khi** chính sách bảo mật và câu đồng ý được duyệt. Khác `true` thì form trả 503 dù đã có khoá Supabase |
| `PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Production | secret: có | Chống spam (cả hai form) |
| `FORM_ALLOWED_ORIGINS` | Production | không | Origin bổ sung được phép POST (vd. domain mới khi chuyển đổi) |
| `ENABLE_VERCEL_ANALYTICS` | Production | không | `true` bật Web Analytics không cookie |

Preview **không** nên có `SUPABASE_SERVICE_ROLE_KEY`: form ở preview sẽ trả `503` thay vì ghi vào dữ liệu thật. Đây là hành vi mong muốn.

## 3. Danh sách kiểm tra trước khi ra mắt

- [ ] Nội dung, ảnh, thông tin liên hệ và câu đồng ý được chủ dự án duyệt (nội dung mẫu bài 4–10 đã thay bằng nội dung thật; ảnh minh hoạ thay bằng ảnh có bản quyền rõ ràng).
- [ ] Trang *Chính sách bảo mật* đã xuất bản và được liên kết từ biểu mẫu.
- [ ] Font: bản dựng chỉ dùng font SIL OFL (Be Vietnam Pro, Mona Sans, Barlow Condensed, Dancing Script; xem `docs/design/FONTS.md`). Marketing duyệt hiển thị nhãn/câu viết tay; nếu VBFA có giấy phép web cho SVN-Bebas Neue Pro / SVN-Primark thì làm theo mục "Quay lại font SVN" trong tài liệu đó.
- [ ] Domain đã trỏ về Vercel; `PUBLIC_SITE_URL` = domain chính thức.
- [ ] Chính sách bảo mật và câu đồng ý đã được duyệt bằng văn bản; chỉ sau đó đặt `LEADS_ENABLED=true` trên Production.
- [ ] **Kiểm thử E2E với danh tính thử** (email dạng `qa+<ngày>@<domain của VBFA>`), trên Preview có Supabase thử hoặc Production sau khi bật công tắc:
  - gửi form hội viên → có đúng 1 hàng `kind='membership'` trong `website_leads`, `ip_hash` là chuỗi hex 32 ký tự, `utm` chỉ có khoá `utm_*`, `source_path` không có `?`;
  - gửi bản tin → đúng 1 hàng `kind='newsletter'`; gửi lại cùng email (khác hoa/thường) → phản hồi giống hệt nhưng **không** thêm hàng;
  - email sai hoặc bỏ tick đồng ý → không có hàng mới;
  - gửi liên tiếp → lead thứ 6 trong 10 phút nhận 429; gửi lặp 16 lần cùng một email bản tin cũng nhận 429 (đếm cả lượt không lưu);
  - tạm đổi `SUPABASE_URL` sai trên Preview → form báo lỗi và không hàng nào được tạo;
  - `select * from public.form_attempts limit 5` chỉ có hash, loại form, thời gian;
  - xoá các hàng thử (`delete from public.website_leads where email like 'qa+%'`) và ghi lại ngày/giờ xoá vào biên bản.
- [ ] Turnstile bật cho cả hai form (kiểm tra widget xuất hiện và token được gửi); thêm hostname vào widget.
- [ ] Firewall của Vercel: thêm quy tắc rate-limit cho `/api/*` (ví dụ 30 yêu cầu/phút/IP → chặn 10 phút) để chặn lưu lượng ồ ạt chưa qua kiểm tra hợp lệ (ứng dụng chỉ đếm các lượt đã qua validation).
- [ ] Đặt `PUBLIC_SITE_INDEXING=on` → build lại → kiểm tra `robots.txt` có `Sitemap:` và các trang không còn `noindex`; gửi `sitemap.xml` cho Google Search Console.
- [ ] Lighthouse (di động) trên URL production: Performance / Accessibility / SEO.
- [ ] Đã thử trên thiết bị thật (iOS Safari, Android Chrome) và bằng trình đọc màn hình.

## 4. Chạy cục bộ

Yêu cầu Node 24 (xem `.nvmrc`; chạy cục bộ tối thiểu 22.23.4).

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
| Form không gửi được | Vercel → Logs → lọc `event: lead.*`. Mã: `lead.not_configured` (thiếu Supabase, `IP_HASH_SALT` hoặc `LEADS_ENABLED`), `lead.store_failed` (Supabase), `lead.rate_limited`, `lead.captcha_failed`, `lead.origin_rejected`, `lead.dropped` (bot) |
| Build lỗi sau khi Publish | Vercel → Deployments → log build: thông báo `Invalid article "…" from Sanity` chỉ rõ trường sai. Bản cũ vẫn đang chạy |
| Nội dung chưa cập nhật | Kiểm tra webhook Sanity đã gọi Deploy Hook (manage.sanity.io → API → Webhooks → Attempts) |
| Hiệu năng thật | Vercel Speed Insights (nếu bật) hoặc Lighthouse |
| Xoá dữ liệu theo yêu cầu của khách | Supabase → `website_leads` → xoá hàng theo email (hoặc đổi `status = 'deleted'` rồi xoá định kỳ) |

**Quay lại bản trước**: Vercel → Deployments → chọn bản tốt → *Promote to Production* (hoặc Instant Rollback).
