# Hướng dẫn Owner cấp quyền cho agents — từng bước, khoảng 30–40 phút

**Ba quy tắc**

1. **Không gửi bí mật (khoá, token, mật khẩu) qua chat.** Bí mật chỉ nằm ở hai nơi: *Vercel → Environment Variables (bật Sensitive)* và *GitHub → Actions secrets*. Nhập thẳng vào đó.
2. Sau mỗi bước chỉ cần nhắn: **`xong bước N`** (kèm thông tin *không bí mật* nếu có). Agents tự kiểm tra bằng công cụ, không hỏi lại từng bước.
3. Khoá thử Cloudflare Turnstile ở dưới là khoá **công khai của Cloudflare, luôn "pass"**. Chỉ dùng cho Preview được bảo vệ, **không bao giờ đặt ở Production**.

**Chẩn đoán đã làm (2026-10-23)**: team Vercel `quangnm` có 1 thành viên (bạn, OWNER). Kết nối Vercel của agents đọc được project, deployment, log nhưng bị `403` khi đọc biến môi trường và không tạo được firewall ⇒ kết nối đang được cấp **quyền hẹp hơn tài khoản Owner của bạn**; việc cần làm là cấp lại quyền cho kết nối (Bước 1), không phải mời thêm người. Kết nối GitHub đang đại diện đúng tài khoản `Quangnm0208`. Sanity không có kết nối nào (Bước 3).

---

## Bước 1 — Cấp lại quyền cho kết nối Vercel (5 phút)  ·  tương ứng mục 1 của bảng Owner

- [ ] Mở https://claude.ai/customize/connectors → chọn **Vercel** → đăng nhập lại.
- [ ] Ở màn hình cấp quyền: chọn đúng team **Quang (`quangnm`)**, cho phép **tất cả** quyền được hỏi (đọc/ghi project, biến môi trường, deployment, log, firewall).
- [ ] Mở danh sách công cụ của Vercel → đặt các công cụ về **Allowed** (nếu có công cụ bị tắt/giới hạn bởi quản trị viên tổ chức, ghi lại tên).
- [ ] **Mở một phiên làm việc mới** (kết nối chỉ được đọc khi phiên bắt đầu) rồi nhắn `xong bước 1`.

Dấu hiệu thành công: agents đọc được danh sách biến môi trường của `vfba-website` (hiện đang `403`).
Nếu sau bước này vẫn `403`: dùng **Phương án B** (cuối trang).

## Bước 2 — Tạo Vercel Deploy Hook cho nhánh thử (1 phút)  ·  mục 1

Kết nối Vercel **không có công cụ tạo Deploy Hook**, nên đây là thao tác tay duy nhất ở Vercel.

- [ ] Vercel → project **vfba-website** → **Settings → Git → Deploy Hooks**.
- [ ] *Name*: `sanity-preview` · *Branch*: `feat/vbfa-services-activation-20261022` → **Create Hook**.
- [ ] **Sao chép URL** (coi như mật khẩu; ai có URL là gọi build được). **Đừng gửi chat** — dán thẳng vào Bước 3. Không dùng hook của `main`.

## Bước 3 — Tạo webhook Sanity (3 phút)  ·  mục 2

Cách đơn giản nhất và an toàn nhất: **bạn tự tạo trong giao diện** — không phải cấp token quản trị Sanity cho ai. Studio đã chạy, không tạo lại.

- [ ] https://www.sanity.io/manage → project **iqyx5ttc** → **API → Webhooks → Create webhook**.
- [ ] *Name*: `vbfa-preview-rebuild` · *URL*: dán Deploy Hook ở Bước 2 · *Dataset*: `production`.
- [ ] *Trigger on*: tích **Create, Update, Delete**.
- [ ] *Filter* (dán nguyên dòng): `_type in ["article","page","homePage","newsPage","siteSettings","popup"]`
- [ ] *HTTP method*: **POST** · **bỏ tích "Include drafts"** (và "Include versions" nếu có) · Projection để trống · bật **Enable webhook** → **Save**.
- [ ] Nhắn `xong bước 3`. Agents sẽ nhờ bạn **Publish một bài thử**, rồi tự đối chiếu: Vercel có deployment mới do deploy hook tạo, trang cập nhật; sau đó lần lượt sửa → Unpublish → xoá. Nếu có lượt gọi lỗi, bạn xem ở *Webhooks → Attempts* (chỉ chủ project thấy).

## Bước 4 — Đặt secrets và biến môi trường (10–15 phút)  ·  mục 3

### 4a. Lấy khoá Supabase (không gửi chat)
- [ ] Supabase Dashboard → project **VBFA** (`bzrtllytykldnawbuszu`) → **Project Settings → API Keys** → sao chép khoá **`service_role`** (hoặc khoá *secret* `sb_secret_…`). Chỉ dán vào Vercel ở 4b.

### 4b. Vercel → project **vfba-website** → **Settings → Environment Variables → Add**
Với **mỗi** biến dưới đây: *Environments* = **chỉ Preview** → ô *Select a custom Git branch* = `feat/vbfa-services-activation-20261022`. **Không** chọn Production/Development.

| Tên biến | Giá trị | Bật *Sensitive* |
|---|---|---|
| `SUPABASE_URL` | `https://bzrtllytykldnawbuszu.supabase.co` | không |
| `SUPABASE_SERVICE_ROLE_KEY` | khoá ở 4a | **có** |
| `IP_HASH_SALT` | chuỗi ngẫu nhiên ≥ 32 ký tự (trình quản lý mật khẩu → "tạo mật khẩu" 64 ký tự chữ+số) | **có** |
| `PUBLIC_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA` | không |
| `TURNSTILE_SECRET_KEY` | `1x0000000000000000000000000000000AA` | **có** |
| `LEADS_ENABLED` | `true` — chỉ trong lúc chạy E2E; agents sẽ báo khi nào đặt lại `false` (hoặc tự đặt nếu Bước 1 thành công) | không |

Đồng thời kiểm tra các biến này **đã có** trên Preview của nhánh (nếu thiếu thì thêm): `PUBLIC_SANITY_PROJECT_ID=iqyx5ttc` · `PUBLIC_SANITY_DATASET=production` · `PUBLIC_SANITY_API_VERSION=2026-10-01` · `PUBLIC_SITE_INDEXING=off`.

### 4c. Secret GitHub cho workflow E2E
- [ ] Vercel → **Settings → Deployment Protection → Protection Bypass for Automation → Add** → sao chép secret.
- [ ] GitHub → repo `Quangnm0208/VFBA-website` → **Settings → Secrets and variables → Actions → New repository secret** → tên **`VERCEL_PROTECTION_BYPASS`** → dán.
      Phải là **Repository secret** (không phải Environment secret — job E2E không khai báo environment).
- [ ] Nhắn `xong bước 4`. Agents sẽ tự redeploy nhánh để nhận biến mới (`PUBLIC_TURNSTILE_SITE_KEY` được đọc lúc build), chạy workflow `VBFA Preview real-service E2E`, đối chiếu **đúng 3 hàng** trong Supabase bằng SQL, xoá hàng thử, kiểm tra log không có dữ liệu cá nhân, rồi báo kết quả.

## Bước 5 — Người dùng Beta (5 phút)  ·  mục 4

Repo này **không có CRM**. Lead nằm trong bảng Supabase `website_leads`. Vì vậy 3 vai trò tương ứng như sau — **mời trực tiếp trong từng công cụ, không cần gửi email cho agents**:

- [ ] **Marketing** → Sanity manage → project `iqyx5ttc` → **Members → Invite** → vai trò **Editor** (viết và xuất bản, không quản trị).
- [ ] **Người quản trị lead** (thay cho "CRM admin") → Supabase → Organization → **Team → Invite** → vai trò thấp nhất đủ xem bảng `website_leads` (không cấp Owner). Cách xem/xoá: `docs/privacy/DATA_SUBJECT_REQUESTS.vi.md`.
- [ ] **Người thử phía khách** → Preview đang được bảo vệ bằng Vercel Authentication nên họ không mở trực tiếp được. Bạn tạo link xem thử tạm thời (Vercel → deployment → *Share*) hoặc nhắn agents tạo link có hạn. Họ **chỉ nhập dữ liệu giả** (ví dụ `ten.thu@example.invalid`).
- [ ] Nhắn `xong bước 5` và ghi **tên + vai trò** (không cần email) vào bảng ở Bước 6.

## Bước 6 — Xác nhận phạm vi Beta và người duyệt (5 phút)  ·  mục 5 và 6

**6a. Sao chép nguyên văn đoạn dưới vào chat (điền tên) — đây là văn bản cho phép của Owner:**

> XÁC NHẬN PHẠM VI BETA — Owner: *[họ tên]*, *[ngày]*.
> Tôi cho phép agents: (1) deploy Preview được bảo vệ của nhánh `feat/vbfa-services-activation-20261022`; (2) bật `LEADS_ENABLED=true` **chỉ** trên Preview đó, với khoá Turnstile thử và dữ liệu giả; (3) ghi và xoá các bản ghi thử `e2e-…@example.invalid` trong Supabase `bzrtllytykldnawbuszu`; (4) thêm migration bổ sung **không phá huỷ dữ liệu**, sau khi có báo cáo tác động và sao lưu.
> Agents **không** được: merge vào `main`, đổi bất kỳ thứ gì ở Production, bật form thật, đổi domain hay chỉ mục, xoá dữ liệu thật.
> Beta chỉ dùng dữ liệu giả lập cho tới khi Chính sách bảo mật, câu đồng ý và thời hạn lưu được duyệt bằng văn bản.

**6b. Người duyệt (điền tên và vai trò):**

| Hạng mục | Người duyệt | Việc cần quyết |
|---|---|---|
| Nội dung công khai (trang chủ, thông tin chung, thay `Test-123` và trang Tin tức "Test") | | duyệt chữ trước Release A |
| Ảnh / bản quyền | | nguồn gốc ảnh thương hiệu và ảnh bài viết |
| Font | | font SVN còn trong lịch sử Git và deployment Production hiện tại: xin giấy phép hay làm sạch |
| Thông tin liên hệ chính thức | | email, điện thoại, địa chỉ để điền vào Studio |
| Pháp lý / quyền riêng tư | | duyệt `docs/privacy/PRIVACY_POLICY_DRAFT.vi.md`, `CONSENT_TEXTS.vi.md`, `RETENTION_PROPOSAL.vi.md` |

- [ ] Nhắn `xong bước 6`.

---

## Phương án B — nếu Bước 1 vẫn bị `403` (cho agents gọi API trực tiếp từ phiên làm việc)

Chỉ làm khi cần; token nằm trong môi trường của agents nên hãy cấp quyền hẹp, đặt hạn dùng ngắn và thu hồi sau Beta.

- [ ] Tạo token: Vercel → **Account Settings → Tokens → Create** (scope: team `quangnm`, hạn 30 ngày).
- [ ] Trong ứng dụng Claude Code: menu môi trường cloud (thanh tiêu đề của phiên) → **Edit** → mục **Network secrets** (hoặc biến môi trường nếu không có mục này) → thêm `VERCEL_TOKEN`. Báo tên biến cho agents (không báo giá trị).
- [ ] Cùng màn hình, **Network access → Allowed domains**: thêm `api.vercel.com` và `*.vercel.app` (để agents chạy QA trình duyệt và gọi API Preview), tuỳ chọn thêm `bzrtllytykldnawbuszu.supabase.co` và `iqyx5ttc.api.sanity.io` để kiểm tra Data API và nội dung.
- [ ] Mở phiên mới. Agents không bao giờ yêu cầu dán token vào chat.

## Agents tự làm sau khi bạn nhắn `xong bước 4`

1. Redeploy nhánh activation (đúng commit), xác minh biến và `noindex` trên Preview.
2. Chạy `VBFA Preview real-service E2E` (host nhánh, `write-test-rows`) → đối chiếu SQL thật = đúng 3 hàng → xoá → `count = 0` → tìm email thử trong log Vercel → không thấy.
3. Nghiệm thu webhook (Bước 3): Publish → sửa → Unpublish → xoá, ghi deployment/thời điểm.
4. Đặt `LEADS_ENABLED` về `false` trên Preview, cập nhật `docs/RELEASE_PACKET.md` và bình luận PR #8.
5. Kiểm tra lần chạy đầu của cron `vbfa-purge-lead-metadata` (`cron.job_run_details`).

6. **WAF `/api/*`**: nếu Bước 1 thành công (có quyền firewall), agents tự tạo quy tắc (đường dẫn bắt đầu `/api/`, 30 yêu cầu / 60 giây theo IP, hành động 429, phạt 10 phút) và đọc lại để xác minh. Nếu không, bạn tạo tay theo đúng thông số đó: Vercel → Firewall → Add rule.

**Còn lại chỉ Owner quyết định**: branch protection cho `main` (GitHub → Settings → Branches: yêu cầu PR + CI xanh, cấm force-push) và bảo vệ GitHub Environment `vbfa-cms` (người duyệt bắt buộc), duyệt pháp lý và nội dung, quyết định domain/chỉ mục, và **GO** cho Release A / B.
