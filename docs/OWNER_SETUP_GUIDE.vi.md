# Hướng dẫn Owner cấp quyền cho agents — từng bước, khoảng 30–40 phút

**Ba quy tắc**

1. **Không gửi bí mật (khoá, token, mật khẩu) qua chat.** Bí mật chỉ nằm ở hai nơi: *Vercel → Environment Variables (bật Sensitive)* và *GitHub → Actions secrets*. Nhập thẳng vào đó.
2. Sau mỗi bước chỉ cần nhắn: **`xong bước N`** (kèm thông tin *không bí mật* nếu có). Agents tự kiểm tra bằng công cụ, không hỏi lại từng bước.
3. Khoá thử Cloudflare Turnstile ở dưới là khoá **công khai của Cloudflare, luôn "pass"**. Chỉ dùng cho Preview được bảo vệ, **không bao giờ đặt ở Production**.

**Chẩn đoán đã làm (2026-10-23)**: team Vercel `quangnm` có 1 thành viên (bạn, OWNER). Kết nối Vercel của agents đọc được project, deployment, log nhưng bị `403` khi đọc biến môi trường và không tạo được firewall ⇒ kết nối đang được cấp **quyền hẹp hơn tài khoản Owner của bạn**; việc cần làm là cấp lại quyền cho kết nối (Bước 1), không phải mời thêm người. Kết nối GitHub đang đại diện đúng tài khoản `Quangnm0208`. Sanity không có kết nối nào (Bước 3).

---

## Tiến độ (cập nhật 2026-10-23; nguồn: ảnh chụp màn hình của Owner, chưa tự xác minh bằng công cụ trừ khi ghi rõ)

| Bước | Trạng thái | Ghi chú |
|---|---|---|
| 1. Quyền Vercel | đã bật *Always allow* cho 147 công cụ đọc + 97 công cụ ghi | phiên hiện tại vẫn `403` khi đọc biến môi trường (kết nối chỉ nạp quyền mới khi mở phiên mới); không cản E2E |
| 2. Deploy Hook | đã tạo `sanity-preview`, nhánh `feat/vbfa-services-activation-20261022` | URL không lộ trong ảnh |
| 3. Webhook Sanity | Owner báo đã tạo | chưa có bằng chứng build do webhook: cần một lần Publish thử |
| 4. Biến Vercel | đã thêm; còn 2 chỗ cần sửa: `IP_HASH_SALT` đang ở **Production** (cần Preview + nhánh), `SUPABASE_SERVICE_ROLE_KEY` có thêm 1 dòng Preview **không gắn nhánh** (nên xoá) | tuỳ chọn: gắn nhánh cho `PUBLIC_TURNSTILE_SITE_KEY`, bật Sensitive cho `TURNSTILE_SECRET_KEY` |
| 4. Chạy E2E thật | **ĐẠT** (HTTP 24/24, SQL đúng 3 hàng, log không PII, đã xoá, count = 0) | `docs/evidence/E2E_REAL_2026-10-23.md`; **lưu ý**: ảnh danh sách biến mới nhất **không còn `IP_HASH_SALT`** ở Production lẫn Preview — build kế tiếp sẽ mất salt và form trả 503 nếu không thêm lại (Preview + nhánh, Sensitive) |
| 4. Secret GitHub | đã có `SANITY_DEPLOY_TOKEN` và `VERCEL_PROTECTION_BYPASS` (repository secrets) | thấy trong ảnh |
| 5. Người dùng Beta / Supabase Auth | **xem Bước 7** (CRM Beta đã xây xong, đang chờ 3 thao tác của Owner) | agents tạo được tài khoản kiểm thử tổng hợp; tài khoản **thật** của quản trị/nhân viên do Owner tạo |
| 6. Xác nhận phạm vi Beta + người duyệt | phạm vi CRM Beta đã được giao trong prompt Beta-first của Owner (migration `0007` chỉ **thêm**, không cấp quyền cho `anon`/`authenticated`) | vẫn cần người duyệt nội dung/pháp lý trước khi dùng dữ liệu thật |
| 8. Cổng quản trị `vbfa-admin` (Nội dung + Lead một địa chỉ) | **chờ Owner** (kết nối Vercel của agents không tạo được project: `403`) | mã nguồn, kiểm thử và workflow đã sẵn sàng: `docs/ADMIN_PORTAL.vi.md`; **Bước 8** dưới đây |

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

## Bước 5 — Người dùng Beta và đăng nhập CRM (10 phút)  ·  mục 4

Theo `docs/BETA_FIRST_OWNER_AGENT_PLAYBOOK.md`, Beta cần một **Lead Inbox (CRM tối thiểu) có đăng nhập** do agents xây; hiện repo **chưa có** — `website_leads` mới chỉ là bảng dữ liệu, và Supabase Auth đang trống (0 người dùng). Vì vậy bước này chuẩn bị "cửa vào" an toàn. **Mời/tạo người trực tiếp trong từng công cụ; không gửi email cho agents.**

- [ ] **Marketing (Sanity)** → https://www.sanity.io/manage → project `iqyx5ttc` → **Members → Invite** → vai trò **Editor** (viết và xuất bản, không quản trị).
- [ ] **Chỉ nhận người được mời trong Supabase Auth** → Supabase → project VBFA → **Authentication → Sign In / Providers → Email**: bật Email, **tắt "Allow new users to sign up"** (không cho đăng ký công khai). Nhắn lại đã tắt.
- [ ] **Authentication → URL Configuration**: *Site URL* = `https://vfba-website-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app`; *Redirect URLs* thêm `https://vfba-website-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app/admin/**`.
- [ ] **Tạo người dùng CRM** → **Authentication → Users → Add user → Create new user**: nhập email + mật khẩu tạm, **tích Auto Confirm User**. Làm cho: bạn (admin), từng nhân viên Marketing/CRM (staff), người thử phía khách nếu họ được xem lead. (Dịch vụ email mặc định của Supabase chỉ hợp thử nghiệm nhỏ, nên Beta dùng cách tạo trực tiếp; gửi mật khẩu tạm qua kênh an toàn của bạn, yêu cầu đổi sau khi đăng nhập lần đầu.)
- [ ] **Ai được xem dữ liệu lead**: chỉ cần nhắn *số lượng* admin và staff. Sau khi agents giao migration + trang `/admin/leads/`, bạn chạy **một đoạn SQL** (agents cung cấp) trong Supabase SQL Editor để gán vai trò `admin`/`staff` theo email — email chỉ gõ trong SQL Editor, không qua chat.
- [ ] **Người thử phía khách**: Preview đang được bảo vệ bằng Vercel Authentication nên họ không mở trực tiếp được. Tạo link xem thử tạm thời (Vercel → deployment → *Share*) hoặc nhắn agents tạo link có hạn. Họ **chỉ nhập dữ liệu giả** (ví dụ `ten.thu@example.invalid`).
- [ ] Nhắn `xong bước 5` và ghi **tên + vai trò** (không cần email) vào bảng ở Bước 6.

## Bước 6 — Xác nhận phạm vi Beta và người duyệt (5 phút)  ·  mục 5 và 6

**6a. Sao chép nguyên văn đoạn dưới vào chat (điền tên) — đây là văn bản cho phép của Owner:**

> XÁC NHẬN PHẠM VI BETA — Owner: *[họ tên]*, *[ngày]*.
> Tôi cho phép agents: (1) deploy Preview được bảo vệ của nhánh `feat/vbfa-services-activation-20261022`; (2) bật `LEADS_ENABLED=true` **chỉ** trên Preview đó, với khoá Turnstile thử và dữ liệu giả; (3) ghi và xoá các bản ghi thử `e2e-…@example.invalid` trong Supabase `bzrtllytykldnawbuszu`; (4) thêm migration bổ sung **không phá huỷ dữ liệu**, sau khi có báo cáo tác động và sao lưu.
> (5) **Xây Lead Inbox tối thiểu** (Supabase Auth chỉ mời, trang `/admin/leads/` `noindex`, API `/api/admin/*` kiểm quyền phía máy chủ) và đồng ý các thay đổi DB sau, **chỉ cộng thêm**: tạo 3 bảng mới `crm_staff` (danh sách vai trò admin/staff), `lead_notes` (ghi chú nội bộ) và `crm_audit` (nhật ký thao tác, không chứa bí mật), bật RLS, **không cấp quyền nào cho `anon` và `authenticated`**; không sửa hay xoá bảng `website_leads`/`form_attempts` hiện có (trạng thái lead dùng cột `status` sẵn có).
> Agents **không** được: merge vào `main`, đổi bất kỳ thứ gì ở Production, bật form thật, đổi domain hay chỉ mục, xoá dữ liệu thật; thêm sản phẩm/dự án trả phí mới.
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

## Cloudflare (chỉ cần cho Release B)

Beta dùng khoá Turnstile thử nên **không cần** Cloudflare. Khi chuyển sang khoá thật, kết nối **Cloudflare** của agents cần đăng nhập tại https://claude.ai/customize/connectors (hiện đang chờ đăng nhập), hoặc bạn tự tạo widget Turnstile và đặt khoá vào Vercel (Sensitive).

## Agents tự làm sau khi bạn nhắn `xong bước 4`

1. Redeploy nhánh activation (đúng commit), xác minh biến và `noindex` trên Preview.
2. Chạy `VBFA Preview real-service E2E` (host nhánh, `write-test-rows`) → đối chiếu SQL thật = đúng 3 hàng → xoá → `count = 0` → tìm email thử trong log Vercel → không thấy.
3. Nghiệm thu webhook (Bước 3): Publish → sửa → Unpublish → xoá, ghi deployment/thời điểm.
4. Đặt `LEADS_ENABLED` về `false` trên Preview, cập nhật `docs/RELEASE_PACKET.md` và bình luận PR #8.
5. Kiểm tra lần chạy đầu của cron `vbfa-purge-lead-metadata` (`cron.job_run_details`).

6. **WAF `/api/*`**: nếu Bước 1 thành công (có quyền firewall), agents tự tạo quy tắc (đường dẫn bắt đầu `/api/`, 30 yêu cầu / 60 giây theo IP, hành động 429, phạt 10 phút) và đọc lại để xác minh. Nếu không, bạn tạo tay theo đúng thông số đó: Vercel → Firewall → Add rule.

**Còn lại chỉ Owner quyết định**: branch protection cho `main` (GitHub → Settings → Branches: yêu cầu PR + CI xanh, cấm force-push) và bảo vệ GitHub Environment `vbfa-cms` (người duyệt bắt buộc), duyệt pháp lý và nội dung, quyết định domain/chỉ mục, và **GO** cho Release A / B.

---

## Bước 7 — Bật CRM Beta (khoảng 10 phút)  ·  3 thao tác, vì kết nối Vercel/Supabase của agents không đổi được các thiết lập này

CRM đã xây, đã chạy cơ sở dữ liệu thật (migration `0007`, schema thật = schema trong repo) và đang **tắt**. Bật cho Preview Beta:

- [ ] **7a. Vercel → project `vfba-website` → Settings → Environment Variables** → thêm 2 biến, *Environment* = **Preview**, *Git Branch* = `feat/vbfa-services-activation-20261022` (đúng như các biến khác):
  - `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable__yum5tUJdlQAjBw08FJDpQ_Lef4GGoZ` (khoá **công khai** theo thiết kế của Supabase, gửi chat được; để **không** Sensitive)
  - `CRM_ENABLED` = `true`
  Sau đó **đừng bấm Redeploy**: nhắn `xong bước 7a`, agents đẩy một commit lên nhánh để Vercel tự build một bản **Preview** mới có biến mới. Lý do: nút *Redeploy* làm lại đúng môi trường của bản bạn bấm; nếu đó là một bản có nhãn *Production* (có những bản như vậy cho cùng nhánh) thì build chạy ở **Production**, bị từ chối vì Production chưa có `PUBLIC_SANITY_PROJECT_ID` (đã xảy ra lúc 06:43 và 11:25 UTC; Production không bị ảnh hưởng, xem `docs/RELEASE_PACKET.md`). Nếu vẫn muốn tự bấm: chỉ chọn một bản **không** có nhãn Production (Preview, trạng thái *Ready*) và kiểm tra dòng *Environment* của hộp thoại là Preview.
- [ ] **7b. Supabase → Authentication → Sign In / Providers → Email** → **tắt "Allow new users to sign up"** → Save. (Kiểm thử tự động sẽ báo ĐỎ nếu còn bật.)
- [ ] **7c. Tạo tài khoản quản trị thật của bạn**: *Authentication → Users → Add user → Create new user* (email + mật khẩu mạnh, tích **Auto Confirm User**). Rồi *SQL Editor* chạy (thay email của bạn):
  ```sql
  insert into public.crm_staff (email, role, created_by) values (lower('email-cua-ban@vi-du.vn'), 'admin', 'bootstrap');
  ```
  Mở `<địa chỉ Preview>/admin/` và đăng nhập. Mật khẩu chỉ gõ ở Supabase/CRM, không gửi chat.

Nhắn `xong bước 7`. Agents sẽ tự: tạo 4 tài khoản kiểm thử tổng hợp (`crm-e2e-*@vbfa-beta.invalid`, không cần bạn làm gì), chạy kiểm thử thật (form → Supabase → CRM, phân quyền, đăng xuất thu hồi phiên…), xoá dữ liệu thử và ghi biên bản.
Hướng dẫn dùng CRM cho quản trị/nhân viên: `docs/CRM.vi.md`.

---

## Bước 8 — Tạo Cổng quản trị `vbfa-admin` (khoảng 15 phút)  ·  Nội dung (CMS) và Lead (CRM) trên **một** địa chỉ

Agents đã viết xong và kiểm thử Cổng quản trị (`docs/ADMIN_PORTAL.vi.md`) nhưng **không tạo được project Vercel và không đặt được biến môi trường** (kết nối `403`). Không dịch vụ trả phí mới; dùng đúng team `quangnm`, Sanity `iqyx5ttc`, Supabase `bzrtllytykldnawbuszu`.

- [ ] **8a. Tạo project.** Vercel → **Add New… → Project** → Import `Quangnm0208/VFBA-website`.
  - *Project Name*: `vbfa-admin`
  - *Root Directory*: `studio` (bấm Edit)
  - *Framework Preset*: **Other** · để trống mọi ô Build/Install/Output override (đã có trong `studio/vercel.json`)
  - mở rộng *Root Directory* và **giữ bật** "Include source files outside of the Root Directory in the Build Step" (mặc định bật)
  - **chưa bấm Deploy** nếu chưa xong 8b (nếu đã bấm: lần build đầu sẽ báo thiếu biến, không sao; sau 8b agents đẩy một commit để build lại, **đừng Redeploy**).
- [ ] **8b. Biến môi trường** (trước khi Deploy, hoặc *Settings → Environment Variables*): *Environment* = **Preview**, *Git Branch* = `feat/vbfa-services-activation-20261022`:
  - `SUPABASE_URL` = `https://bzrtllytykldnawbuszu.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` = khoá service-role của Supabase (*Supabase → Project Settings → API Keys*), bật **Sensitive**. Giống giá trị đã dùng ở project `vfba-website`; **không gửi qua chat**.
  - `SANITY_STUDIO_PROJECT_ID` = `iqyx5ttc`
  - `SANITY_STUDIO_DATASET` = `production`
- [ ] **8c. Không build nhánh khác.** *Settings → Git → Ignored Build Step → Custom* và nhập: `test "$VERCEL_GIT_COMMIT_REF" != "feat/vbfa-services-activation-20261022"` (tránh một lần build `main` thất bại vô ích; `main` chưa có `studio/vercel.json`).
- [ ] **8d. Bảo vệ.** *Settings → Deployment Protection*: **Vercel Authentication** để bật (mặc định). Bật **Protection Bypass for Automation** → copy secret → GitHub repo → *Settings → Secrets and variables → Actions → New repository secret* tên **`VBFA_ADMIN_PROTECTION_BYPASS`**.
- [ ] **8e. Nhắn `xong bước 8`.** Agents sẽ: xác minh project/biến bằng công cụ, thêm **đúng một** origin vào CORS của Sanity (workflow `run-sanity-cors`; nếu token thiếu quyền, agents ghi `OWNER_ACTION_REQUIRED`: vào *sanity.io/manage → API → CORS origins → Add* origin `https://vbfa-admin-git-feat-vbfa-services-activation-20261022-quangnm.vercel.app`, bật *Allow credentials*, **không** dùng ký tự đại diện `*`), rồi chạy kiểm tra thật `run-portal-live`.
- [ ] **8f. Bạn nghiệm thu đăng nhập thật (agents không làm thay được).** Mở địa chỉ Cổng quản trị → đăng nhập bằng tài khoản Sanity của bạn → mục **Quản lý Lead** phải mở được danh sách. Điều kiện: **e-mail Sanity của bạn trùng e-mail trong `crm_staff`** (bước 7c). Nếu khác, chạy ở *Supabase → SQL Editor*:
  ```sql
  insert into public.crm_staff (email, role, created_by) values (lower('email-sanity-cua-ban@vi-du.vn'), 'admin', 'bootstrap')
  on conflict (email) do update set role = 'admin', active = true;
  ```
  Rồi nhắn kết quả: *mở được* / *báo lỗi gì* (chụp màn hình thông báo, **không** chụp token). Chỉ khi bạn xác nhận bước này, mới được gọi là "một lần đăng nhập" (`docs/ADMIN_PORTAL.vi.md` §7).
