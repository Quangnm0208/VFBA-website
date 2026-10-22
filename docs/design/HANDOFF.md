# Handoff: Website VBFA (Hiệp hội Nhiên liệu Sinh học Việt Nam)

## Overview

Website thông tin và kết nối ngành cho VBFA, ngôn ngữ tiếng Việt (`lang="vi"`). Bản thiết kế gồm 3 trang và 3 lớp phủ, responsive ở 3 mốc (390, 834, 1440 px):

| Màn hình | Prototype route | Production route đề xuất |
|---|---|---|
| Trang chủ (hero, Về hiệp hội, Lĩnh vực, Tin tức, Hội viên, Thư viện, bản tin, footer) | `#top` và các neo `#about #focus #news #membership #resources` | `/` |
| Danh sách Tin tức (bài nổi bật, lọc, tìm kiếm, xem thêm) | `#/tin-tuc` | `/tin-tuc` |
| Chi tiết Bài viết (mục lục, điểm chính, chia sẻ, bài trước/sau, bài liên quan) | `#/tin-tuc/<slug>` | `/tin-tuc/<slug>` |
| Menu mobile (drawer), Tìm kiếm (dialog), Form kết nối hội viên (dialog) | trạng thái trong trang | dialog/drawer, không đổi route |

Nguồn gốc: tối ưu từ prototype `VBFA_Executive_Prototype_V4.html`, áp dụng bộ font và logo trong guideline thương hiệu. Toàn bộ copy tiếng Việt của V4 được giữ nguyên. Phần thêm mới: trang Tin tức, trang Bài viết, lớp nền graphic, ô tìm kiếm, mục lục, chia sẻ.

Chưa thiết kế (hiện chỉ là section neo trên trang chủ): trang chi tiết Về VBFA, từng Lĩnh vực, Hội viên, Thư viện, Liên hệ. Chưa có bản tiếng Anh.

## About the Design Files

Các file trong `design_reference/` là **tài liệu tham chiếu thiết kế viết bằng HTML**: prototype thể hiện giao diện và hành vi mong muốn, **không phải mã production để copy**. Nhiệm vụ của dev là **dựng lại các thiết kế này trong môi trường codebase thực tế** (React, Vue, v.v.) theo pattern và thư viện của dự án. Nếu chưa có codebase, xem mục "Gợi ý kỹ thuật" bên dưới.

Ngoài prototype, gói còn có **`code/`**: bản dựng HTML + CSS + JS thuần chạy được, khớp prototype, dùng làm điểm xuất phát (xem mục "Code tham chiếu"). Có thể copy CSS (token, thành phần, chuyển động) và JavaScript từ đây; cấu trúc trang nên tổ chức lại theo framework của dự án.

Không port `support.js` và `image-slot.js`: đây chỉ là runtime để prototype chạy được. `<image-slot>` là khung kéo-thả ảnh của prototype, trong production thay bằng trường ảnh của CMS.

## Fidelity

**High-fidelity (hifi).** Màu, font, cỡ chữ, khoảng cách, bo góc, đổ bóng, chuyển động và tương tác đã chốt. Dựng lại sát từng pixel bằng thư viện của codebase.

Ba điểm chưa phải bản cuối, xem mục "Open items":
1. Nền graphic là bản dựng từ logo và script, chưa dùng file chính thức trong Drive.
2. Bảng màu được lấy mẫu từ artwork logo, chưa đối chiếu với trang bảng màu của guideline.
3. Ảnh bài viết là placeholder; tiêu đề bài 4–10, ngày đăng, nội dung bài viết là nội dung mẫu.

## Cách xem prototype

Chạy một static server trong thư mục `design_reference/` (mở bằng `file://` có thể chặn font hoặc script):

```bash
cd design_reference
npx serve .            # hoặc: python3 -m http.server 8080
```

- Website: `/VBFA%20Website.dc.html`
- Bảng mockup (desktop, tablet, mobile, overlay, nền graphic, bảng nền tảng UI): `/VBFA%20UI%20Mockups.dc.html`
- Mở thẳng một trạng thái: `?page=news`, `?page=article&slug=dong-luc-tuong-lai`, `?modal=join`, `?modal=search`, `?menu=1`. Tham số `embed` chỉ dùng cho bảng mockup.
- Panel Tweaks của prototype: `heroVisual` (`ripple` | `photo`), `showUtilityBar` (boolean), `showGraphics` (boolean), `filterMode` (`dim` | `hide`, xem mục News filter).

## Code tham chiếu (`code/`)

Bản dựng thật của thiết kế, không cần build: 12 trang HTML (trang chủ, Tin tức, 10 bài viết), `assets/css/tokens.css` + `site.css`, `assets/js/site.js`, font và logo. Đã kiểm tra: giao diện khớp prototype ở 1440 px; không tràn ngang ở 390 / 834 / 1440 px; lọc, tìm kiếm, xem thêm, đồng bộ URL, hộp thoại (tìm kiếm, form, menu mobile) mở và đóng bằng nút, nền và Esc đều hoạt động. Chưa kiểm thử bằng trình đọc màn hình.

```bash
cd code && npx serve .      # hoặc: python3 -m http.server 8080
```

Hướng dẫn chi tiết, danh sách chức năng của `site.js` và việc cần làm khi đưa vào dự án thật nằm trong `code/README.md`. Khác biệt cố ý so với prototype: route là file tĩnh (`tin-tuc/<slug>/index.html`) thay vì hash route; hiệu ứng vào của dải hero bắt đầu từ `opacity:0` (prototype bắt đầu từ .55 để ảnh chụp không bị trống); nền graphic dùng CSS class thay vì lớp bật/tắt bằng Tweaks. Mọi dải dưới hero dùng hệ thống hiện dần khi cuộn `[data-rv]` (xem mục "Chuyển động khi cuộn tới"), có ở cả prototype lẫn `code/`.

## Gợi ý kỹ thuật (nếu chưa có codebase)

Nếu team đã có stack, ưu tiên stack đó. Nếu chưa, đề xuất phù hợp với website nội dung cần SEO:

- Next.js (App Router) + TypeScript.
- CSS: dùng `reference/design-tokens.css` làm CSS variables; Tailwind hoặc CSS Modules đều được. Prototype dùng inline style, không có class để copy.
- Dialog/drawer: Radix UI Dialog (focus trap, Esc, khóa cuộn có sẵn).
- Font: `next/font/local` hoặc `@font-face` trong tokens, `font-display: swap`; preload Mona Sans SemiExpanded SemiBold và Be Vietnam Pro Regular.
- Ảnh: `next/image` với `sizes` theo bảng tỉ lệ ở mục Assets.
- Nội dung: CMS headless (Payload, Strapi, Sanity) hoặc MDX trong repo cho bản đầu. Mô hình dữ liệu ở mục Data model.
- Form: Server Action hoặc API route gửi email/CRM; bản tin qua nhà cung cấp email marketing.
- Tìm kiếm: client-side (Pagefind) cho giai đoạn đầu.

## Routing và site map

Prototype dùng hash route để chạy trong một file. Production dùng route thật:

| Prototype | Production | Ghi chú |
|---|---|---|
| `#top` | `/` | Logo và "Trang chủ" |
| `#about`, `#focus`, `#membership`, `#resources` | `/#about`, `/#focus`, `/#membership`, `/#resources` | Neo trên trang chủ. Nếu tách trang riêng sau này, giữ nguyên nhãn menu |
| `#contact` | neo footer trên mọi trang | Footer có id `contact`, cuộn tại chỗ, không đổi trang |
| `#/tin-tuc` | `/tin-tuc` | Lọc và tìm kiếm nên đưa lên query: `?chuyen-muc=tin-nganh\|hoat-dong\|chinh-sach&q=...` để chia sẻ và SEO |
| `#/tin-tuc/<slug>` | `/tin-tuc/<slug>` | Slug không dấu, ví dụ `dong-luc-tuong-lai`. Slug không tồn tại: 404 (prototype rơi về bài đầu tiên) |

Hành vi router của prototype cần giữ: chuyển sang trang Tin tức hoặc Bài viết thì cuộn về đầu trang; bấm một neo của trang chủ khi đang ở trang khác thì về trang chủ và cuộn tới section (trừ `#contact`); nút Back của trình duyệt hoạt động; `document.title` đổi theo trang (xem `docs/content-inventory.md`).

## Screens / Views

Thông số cỡ chữ ghi dạng `clamp()` đúng như prototype; giá trị đã resolve ở 1440 px ghi trong ngoặc khi cần đối chiếu. Màu theo `reference/design-tokens.css`. Toàn bộ chuỗi hiển thị chính xác nằm ở `docs/content-inventory.md`.

### Quy ước chung

- **Container**: `max-width:1280px; margin:0 auto; padding:0 clamp(20px,4vw,48px)`.
- **Section dọc**: `padding: clamp(72px,9vw,128px) 0` (dải nhỏ như bản tin: `clamp(48px,6vw,80px)`).
- **Eyebrow** (nhãn đầu section): Bebas SemiExpanded 700, 14px, line-height 1, letter-spacing .22em, uppercase, màu forest (nền sáng) hoặc lime (nền tối); đứng sau một đường kẻ amber 34×2px, gap 14px.
- **Heading**: H1/H2 dùng Mona Sans SemiExpanded 600, letter-spacing -.02em đến -.025em; H3 dùng Mona Sans 700.
- **Văn bản**: Be Vietnam Pro 400; root 16px / line-height 1.7 / màu `#11271a`.
- **Nút** (radius 6px, font 15px/600, không xuống dòng):
  - Primary forest: nền `#1f5329`, chữ trắng, min-height 46–54px, padding `0 22–28px`; hover nền `#17441f`.
  - Primary lime (trên nền tối): nền `#b2d25a`, chữ `#0b2616`, min-height 52px, padding `0 26px`; hover nền `#c6e07c`.
  - Outline trên nền tối: viền 1px `#6f9279`, chữ trắng; hover nền `rgba(255,255,255,.09)` và viền `#b2d25a`.
  - Outline trên nền sáng: viền 1px `#c5d2c3` (hoặc `#1f5329` với "Xem thêm bài viết"), chữ forest; hover nền `#eef3e1`.
  - Link gạch chân: chữ forest 15px/600, `border-bottom:2px solid #e3a63a`, padding `12px 0 7px`.
  - Tất cả nút có icon mũi tên ↗ 17–18px; hover nút: `translateY(-2px)` và `box-shadow:0 14px 30px rgba(6,30,16,.2)`, mũi tên dịch `translate(2px,-2px)`.
  - Chip lọc: pill 999px, min-height 44px, padding `0 20px`, 14px/600; chọn: nền forest chữ trắng; không chọn: nền trắng viền `#c5d2c3` chữ forest. Dùng `aria-pressed`.
- **Thẻ**: radius 10px, viền 1px, nền trắng. Icon tile 60×60 radius `0 22px 0 22px` (cắt lá), nền `#e6eed2`, icon 28px stroke 1.6, màu forest.
- **Icon**: viewBox 24, stroke `currentColor`, caps/joins tròn, 1.6–2px. Bộ icon vẽ tay trong HTML (cân/luật, biểu đồ, bình thí nghiệm, mầm lá, sách, quả địa cầu, tài liệu, mũi tên, tìm kiếm, menu, đóng, tích, lịch, đồng hồ, liên kết, thư). Thay bằng bộ icon của thương hiệu nếu có.

### Khung chung (mọi trang)

| Phần | Thông số |
|---|---|
| Thanh tiến trình cuộn | Cố định đầu trang, cao 3px, gradient `90deg #96b949 → #e3a63a`, `scaleX` theo % cuộn, z-index 140 |
| Skip link | "Bỏ qua đến nội dung" → `#main`; ẩn ngoài màn hình, hiện ở `top:12px; left:16px` khi focus, z-index 200 |
| Utility bar (từ 721 px) | Nền `#0b2616`, min-height 40px; trái "VBFA · Hiệp hội Nhiên liệu Sinh học Việt Nam" (trắng, 700), phải "Không gian thông tin & kết nối ngành" (`#cfe0cf`); Bebas SemiExp 14px, letter-spacing .16em, uppercase. Tùy chọn `showUtilityBar` |
| Header | `position:sticky; top:0; z-index:60`; nền `rgba(255,255,255,.95)` + `backdrop-filter:saturate(1.5) blur(14px)`; viền dưới `1px #e2e8dd`; khi đã cuộn thêm `box-shadow:0 12px 32px rgba(11,38,22,.09)` (transition .3s). Chiều cao `clamp(68px,6vw,88px)` |
| Logo | `vbfa-logo.png` (1255×516), cao `clamp(46px,4.5vw,60px)`, link về `#top` |
| Nav chính (từ 1041 px) | Căn giữa, gap `clamp(18px,2.4vw,38px)`, 14.5px/600 màu `#26382c`: Trang chủ, Về VBFA, Lĩnh vực, Tin tức, Thư viện, Liên hệ. Hover hoặc `aria-current`: chữ forest + gạch amber 2px dưới chữ (`bottom:-9px`, `scaleX` 0→1 trong .35s). Trang Tin tức: `aria-current="page"`; trang Bài viết: `aria-current="true"` trên "Tin tức"; trang chủ: section đang xem |
| Nút tìm kiếm | Tròn 44×44, viền `#d2dcce`, icon kính lúp forest; hover nền `#eef3e1` |
| CTA header (từ 1041 px) | "Trở thành hội viên", nút forest min-height 46px, mở form kết nối |
| Burger (≤1040 px) | 44×44 radius 8px, viền `#d2dcce`, mở drawer |
| Dải bản tin | Nền `#e5edd1`, `padding: clamp(48px,6vw,80px) 0`; H2 "Đón nhận cập nhật từ VBFA." (`clamp(24px,2.4vw,34px)`/1.28); đoạn 16px/1.7 `#3d5043`; form: input email min-height 54px radius 6px viền `#aebfa9` (focus: viền forest + `0 0 0 3px rgba(150,185,73,.45)`) + nút "Đăng ký". Graphic: giọt vàng ở góc phải (xem "Nền graphic"); cột chữ và form hiện theo hệ thống chung (`data-d` 0 và 1), có ở mọi trang. |
| Footer | Nền `#0b2616`, `padding: clamp(56px,7vw,96px) 0 32px`. Lưới `minmax(0,1.6fr) repeat(3,minmax(0,1fr))`, gap `48px 40px`: logo trắng `vbfa-logo-white-solid.png` cao 72px + mô tả; cột "Khám phá" (Giới thiệu, Lĩnh vực trọng tâm, Tin tức, Hội viên); cột "Thông tin" (Thư viện, Chính sách, Liên hệ); cột "Liên hệ" (đoạn mô tả + liên kết "Mở biểu mẫu kết nối" gạch chân amber). Tiêu đề cột Bebas 15px/700 .22em uppercase lime. Link cao tối thiểu 44px, 15px `#cfe0cf`, hover trắng. Dòng bản quyền: viền trên `rgba(255,255,255,.16)`, 13.5px `#a9c0ab` |
| Nút lên đầu trang | Cố định `right/bottom: clamp(14px,2vw,28px)`, tròn 48px, nền `#0f3a22`, viền `#2f6a3a`, icon trắng; hiện khi `scrollY > 640` (opacity + `translateY(16px→0)`, .35s) |
| Toast | Cố định `bottom:24px`, giữa màn hình, nền `#0b2616`, chữ trắng 14.5px/1.6, radius 10px, padding `16px 20px`, shadow `0 20px 50px rgba(0,0,0,.32)`, icon tích trong vòng lime 26px; `role="status"`; tự tắt sau 4.5s; vào bằng `vbfaToast .4s` |

### 1. Trang chủ

**Hero (`#top`)** — nền `#0b2616`, `overflow:hidden`, `isolation:isolate`.
- Lớp nền: `radial-gradient(56% 78% at 76% 46%, rgba(150,185,73,.22), transparent 64%)`, `radial-gradient(42% 52% at 4% 104%, rgba(227,166,58,.12), transparent 70%)`, `linear-gradient(110deg,#091f12 0%,#0e2f1b 52%,#164126 100%)`. Thêm lớp lưới chấm (xem "Nền graphic").
- Cột chữ `max-width:700px`, padding `clamp(48px,6vw,88px) 0 clamp(56px,7vw,104px)`:
  - Eyebrow lime "Vietnam Biofuels Association".
  - H1 (margin-top 24px) `clamp(32px,4.1vw,60px)` (59.04px) / 1.18, letter-spacing -.025em, trắng, `text-wrap:balance`: "Kết nối nguồn lực." và "Kiến tạo tương lai **năng lượng xanh.**" là hai khối riêng (mỗi khối có mặt nạ `overflow:hidden` cho hiệu ứng trượt lên, đệm `.24em` trên và `.14em` dưới để không cắt dấu tiếng Việt); cụm nhấn màu `#b2d25a`, `white-space:nowrap`, có gạch chân gradient amber → gold vẽ ra sau tiêu đề. Không dùng `<br>`.
  - Đoạn (margin-top 28px) `clamp(16px,1.25vw,18px)`/1.85, `#d4e4d3`, `max-width:540px`.
  - Hai nút (margin-top 40px, gap 14px): lime "Khám phá VBFA" → `#about`; outline "Các lĩnh vực trọng tâm" → `#focus`. Ở ≤720px xếp dọc, full width, nội dung giãn hai đầu.
- Hình bên phải (`heroVisual = ripple`): khung vuông `width:clamp(320px,42vw,620px)`, `right:clamp(-60px,-2vw,0px)`, giữa theo chiều dọc. Vòng gợn đồng tâm tâm (310,310) trong viewBox 620: r = 120/170/224/280, stroke `#96b949` opacity .36/.25/.16/.10; vòng đứt r = 308 stroke `#e3a63a` opacity .4 `stroke-dasharray:2 9`, quay 160s linear vô hạn; 6 nút tròn (r 3.5–6) màu amber/lime/trắng; quầng sáng tròn 74% (`rgba(242,207,117,.24)` → `rgba(150,185,73,.12)` 46% → trong suốt 70%, blur 12px); giọt `vbfa-drop-solid.png` cao 58%, `drop-shadow(0 34px 44px rgba(0,0,0,.45))`, lơ lửng 7s ease-in-out alternate (`translate(-50%,-52%) ↔ (-50%,-48%)`), ba vòng sóng lan ra từ giọt, nút quỹ đạo quay quanh tâm, quầng sáng nền trôi chậm, parallax theo con trỏ (xem mục "Hero: chuỗi chuyển động"); dòng nhãn "Energy · Collaboration · Sustainability" Bebas 14px .3em lime ở đáy (ẩn ≤1040px). Biến thể `heroVisual = photo`: khung ảnh radius `0 140px 0 140px` nền `#1c4a2e→#2f6e43` với image-slot `hero-photo` và giọt nhỏ ở góc trái dưới.
- Dải đáy hero: viền trên `rgba(255,255,255,.14)`, nền `rgba(3,20,11,.38)`, min-height 88px: "KẾT NỐI" (Bebas 20px/700 .14em trắng) + "vì tương lai bền vững" (Primark `clamp(30px,3vw,40px)`, `#f2cf75`) + 3 gạch đầu dòng (chấm amber 6px, 14px `#d4e4d3`: Kết nối doanh nghiệp / Trao đổi chính sách / Chia sẻ tri thức) + liên kết "KHÁM PHÁ BÊN DƯỚI ↓" (Bebas 14px/700 .2em). Ẩn các gạch đầu dòng ở ≤1040px và liên kết ở ≤720px.
- Chuỗi hoạt ảnh của hero: xem mục "Hero: chuỗi chuyển động" bên dưới.

**Về hiệp hội (`#about`)** — nền trắng. Lưới 2 cột `repeat(auto-fit,minmax(min(100%,420px),1fr))`, gap `clamp(40px,6vw,96px)`.
- Trái: eyebrow "Về hiệp hội"; H2 `clamp(27px,2.9vw,42px)` (41.76px)/1.24, `#0f2a1a`, max-width 600; liên kết gạch chân "Tìm hiểu về mạng lưới hội viên" → `#membership`.
- Phải: đoạn `clamp(16px,1.3vw,18px)`/1.9 `#435448`; ba hàng liên kết padding dọc 26px, viền trên `1px #dfe6da` (hàng cuối thêm viền dưới): số 01–03 (Bebas 24px/700 `#b07d17`, rộng 38px), tiêu đề Mona Sans 500 `clamp(17px,1.5vw,20px)`/1.45, nút tròn 42px mũi tên. Hover hàng: nền `#f4f6ec`, padding ngang 16px, nút tròn đổi sang nền forest. Đích: hàng 1 → `#membership`, hàng 2 → `/tin-tuc`, hàng 3 → `#resources`.

**Lĩnh vực trọng tâm (`#focus`)** — nền `#f4f6ec`, `position:relative; overflow:hidden; isolation:isolate`; graphic: vân đồng mức ở góc trên phải (xem "Nền graphic"); hiệu ứng vào xem "Chuyển động khi cuộn tới".
- Hàng tiêu đề: eyebrow, H2 "Những lĩnh vực tạo nên chuyển động ngành." (max-width 640), đoạn phụ 15px/1.85 bên phải (`flex:0 1 410px`), căn đáy, `margin-bottom: clamp(36px,4vw,56px)`.
- Lưới 6 thẻ `repeat(auto-fit,minmax(min(100%,340px),1fr))`, gap 20px (3 cột ở desktop). Thẻ: min-height `clamp(250px,22vw,300px)`, padding `32px 30px 34px`, nền trắng, viền `1px #e0e7da`, radius 10px; hàng đầu "CHỦ ĐỀ / 0N" (Bebas 14px .2em `#5a6b5e`) + nút tròn 36px; icon tile (margin `34px 0 24px`); H3 21px/1.35; mô tả 15px/1.75 `#4a5a4f`; thanh 3px gradient forest→amber ở đáy thẻ. Hover: nâng `translateY(-6px)`, shadow `0 26px 60px rgba(11,46,26,.12)`, viền `#c5d5bd`, tile đổi nền forest + icon lime, nút tròn nền forest, thanh đáy `scaleX(0→1)` (.5s). Mỗi thẻ là liên kết → `#resources`. Thiết bị không hover: bỏ nâng.
- Sáu lĩnh vực: Chính sách & pháp lý, Thị trường & đầu tư, Công nghệ & đổi mới, Phát triển bền vững, Đào tạo & tri thức, Hợp tác quốc tế.

**Tin tức (`#news`, bản rút gọn trên trang chủ)** — nền trắng.
- Hàng tiêu đề: eyebrow "Tin tức & góc nhìn", H2 "Chuyển động ngành, góc nhìn mới.", bên phải đoạn "Khám phá các thông tin, hoạt động và chủ đề nổi bật của ngành." và liên kết gạch chân "Xem tất cả tin tức" → `/tin-tuc`.
- Chip lọc (margin-bottom 32px): Tất cả / Tin ngành / Hoạt động / Chính sách.
- Lưới `repeat(auto-fit,minmax(min(100%,460px),1fr))`, gap 24px: thẻ nổi bật (chiếm 2 hàng, cột trái; ảnh 16:10 min-height 260px, nền gradient placeholder, badge `VBFA / INSIGHTS`; nội dung padding `clamp(24px,2.6vw,36px)`: kicker, H3 `clamp(22px,2vw,28px)`/1.34, đoạn 15.5px/1.8, link "Xem danh mục thông tin" → `/tin-tuc`) và hai thẻ ngang (ảnh `flex:1 1 190px` min-height 200px + nội dung `flex:2 1 270px`, H3 20px/1.38, link "Tìm hiểu hợp tác" → `#membership` và "Xem thư viện" → `#resources`). Tiêu đề thẻ là link tới bài viết 1, 2, 3.
- Lọc: thẻ không khớp mờ còn `opacity:.28`, `grayscale(1)`, `pointer-events:none`, `aria-hidden`, tabindex -1 (mặc định `dim`); biến thể `hide` ẩn hẳn (`display:none`) như V4. Chọn một cách với PM.
- Hover thẻ: viền `#c5d5bd`, shadow `0 24px 56px rgba(11,46,26,.11)`, ảnh phóng 1.045 (.9s), tiêu đề đổi màu forest.

**Hội viên (`#membership`)** — nền `#0e3320`, chữ trắng, `isolation:isolate`, graphic: mosaic ô lá ở góc dưới trái (xem "Nền graphic"); hiệu ứng vào xem "Chuyển động khi cuộn tới".
- Lưới 2 cột `repeat(auto-fit,minmax(min(100%,440px),1fr))`, gap `clamp(40px,6vw,96px)`.
- Trái: eyebrow lime "Kết nối cùng VBFA"; H2 trắng "Cùng xây dựng một mạng lưới hợp tác có giá trị dài hạn."; đoạn `clamp(16px,1.25vw,18px)`/1.85 `#c9dbc9` max-width 520; nút lime "Đăng ký quan tâm hội viên" (mở form).
- Phải: ba hàng (viền trên `rgba(255,255,255,.2)`, padding dọc 28px, hàng cuối thêm viền dưới): vòng tròn 40px viền 1.5px `#96b949` chứa dấu tích lime; tiêu đề Mona Sans 700 20px trắng; mô tả 15px/1.75 `#b9ceb9`. Dưới cùng câu ký Primark `clamp(28px,2.6vw,36px)`/1.45 `#f2cf75`: "Kết nối hôm nay để bắt đầu những trao đổi có giá trị."

**Thư viện (`#resources`)** — nền trắng, để sạch (không có nền graphic), hiệu ứng vào theo hệ thống chung (xem mục "Chuyển động khi cuộn tới"). H2 hai dòng ngắt bằng `<br>`; dải thông điệp nằm trong khung bao có `margin-top:24px`.
- Hàng tiêu đề: eyebrow "Trung tâm thông tin"; H2 "Tri thức dễ tiếp cận." xuống dòng "Nội dung dễ tra cứu."; đoạn phụ bên phải.
- Hai thẻ `repeat(auto-fit,minmax(min(100%,460px),1fr))`, gap 24px: min-height `clamp(240px,20vw,280px)`, padding `clamp(26px,3vw,40px)`, viền `1px #dbe5d7`; icon tile, kicker "01 / THƯ VIỆN" và "02 / CHÍNH SÁCH", H3 `clamp(22px,2vw,27px)`/1.3 ("Tài liệu & báo cáo", "Văn bản & thông tin ngành"), mô tả 15px; nút tròn 52px (neo phủ toàn thẻ) → `#contact`; hover giống thẻ lĩnh vực.
- Dải thông điệp (margin-top 24px): nền `#eaf1d6`, radius 10px, padding `22px 28px`, icon mầm lá 26px + "Cùng mở rộng khả năng tiếp cận thông tin và tri thức về nhiên liệu sinh học." (16px/500 `#1b4a25`).

Sau Thư viện là dải bản tin (khung chung) rồi footer.

### 2. Trang Tin tức (`/tin-tuc`)

**Đầu trang** — nền tối `#0b2616` + gradient `radial(52% 120% at 84% 30%, rgba(150,185,73,.24), transparent 66%)`, `radial(40% 70% at 0% 120%, rgba(227,166,58,.12), transparent 70%)`, `linear(110deg,#091f12,#0e2f1b 55%,#164126)`; graphic: lưới chấm + vòng gợn có giọt (xem "Nền graphic"); chuỗi vào khi tải trang xem "Hero trang Tin tức: chuỗi chuyển động".
- Container padding `clamp(16px,2vw,28px) gutter clamp(56px,7vw,96px)`.
- Breadcrumb (Bebas 14px .16em uppercase; link `#b9ceb9`, hiện tại trắng; vạch ngăn chevron `#6f9279`; link cao ≥ 44px): Trang chủ › Tin tức (`aria-current="page"`).
- Eyebrow lime "Tin tức & góc nhìn" (margin-top `clamp(28px,4vw,56px)`); H1 "Chuyển động ngành, **góc nhìn mới.**" `clamp(34px,4.2vw,58px)`/1.14, letter-spacing -.025em, `max-width:min(780px,62%)` (không giới hạn ở ≤720px), cụm nhấn `#b2d25a` nowrap; đoạn 18px/1.85 `#d4e4d3` max-width 520.

**Danh sách** — nền trắng, `padding: clamp(44px,5.5vw,80px) 0 clamp(72px,9vw,128px)`.
1. **Bài nổi bật** (chỉ hiện khi không lọc, không tìm kiếm): thẻ flex-wrap, viền `#dfe7da`, radius 10px. Ảnh `flex:1.25 1 460px`, min-height `clamp(260px,30vw,420px)`, badge ở `left:20px; bottom:20px`. Nội dung `flex:1 1 360px`, padding `clamp(28px,3.6vw,56px)`, căn giữa dọc: tag "BÀI NỔI BẬT" (nền `#e5edd1`, chữ forest) + "TIN NGÀNH · 21/10/2026" (Bebas 14px .2em `#8a5f0a`); H2 `clamp(24px,2.5vw,34px)`/1.28; đoạn 16px/1.85; thời gian đọc 14px; nút forest "Đọc bài viết". Khi container hẹp dưới khoảng 840px (ví dụ tablet 834px) thẻ xếp dọc: ảnh trên, chữ dưới.
2. **Thanh công cụ** (margin-top `clamp(40px,5vw,64px)`): chip lọc (Tất cả, Tin ngành, Hoạt động, Chính sách) bên trái; ô tìm kiếm pill `min-height:48px`, `flex:0 1 340px`, icon kính lúp, placeholder "Tìm bài viết", focus: viền forest + ring `0 0 0 3px rgba(150,185,73,.4)`.
3. **Dòng đếm** (viền trên `1px #e3e9de`, margin `20px 0 28px`): Bebas 14px .2em uppercase `#5a6b5e`, `aria-live="polite"`: "10 bài viết" hoặc "N bài viết phù hợp"; khi đang lọc có nút chữ "Xóa bộ lọc" (gạch chân).
4. **Lưới thẻ** `repeat(auto-fill,minmax(min(100%,340px),1fr))`, gap `clamp(20px,2.4vw,32px)` (3 cột ở 1440, 2 cột ở 834, 1 cột ở 390). Thẻ dọc: ảnh tỉ lệ 16:10 (nền gradient placeholder xoay vòng a/b/c theo thứ tự bài) + badge ở `left:16px; bottom:16px`; nội dung padding `clamp(22px,2vw,28px)`: kicker Bebas 14px .2em `#8a5f0a`; H3 20px/1.38 (là link); mô tả 14.5px/1.75, cắt 3 dòng; hàng cuối `margin-top:auto` gồm "ngày · thời gian đọc" (13.5px `#5a6b5e`) và link "Đọc tiếp ↗" (cao ≥ 44px, không xuống dòng).
5. **Xem thêm**: mặc định hiển thị bài nổi bật + 6 bài đầu của 9 bài còn lại; nút outline forest "Xem thêm bài viết" hiện thêm 3 bài còn lại rồi ẩn. Khi đang lọc hoặc tìm kiếm, hiện tất cả kết quả (không phân trang) và ẩn bài nổi bật.
6. **Trạng thái rỗng**: khung viền đứt `1px dashed #c5d2c3`, nền `#f4f6ec`, radius 10px, "Không tìm thấy bài viết phù hợp." (Mona Sans 500 20px) + nút forest "Xóa bộ lọc".

### 3. Trang Bài viết (`/tin-tuc/<slug>`)

**Đầu bài** — nền `#f4f6ec`, `overflow:hidden`, padding `clamp(16px,2vw,28px) 0 clamp(80px,9vw,128px)`, lá xanh mờ ở góc phải (xem "Nền graphic").
- Breadcrumb nền sáng (link `#435448`, hover forest, hiện tại `#0f2a1a`): Trang chủ › Tin tức › {tên chuyên mục}.
- Khối `max-width:900px`, margin-top `clamp(24px,3.4vw,48px)`: badge (nền `#0b2616`, chữ `#b2d25a`, Bebas 13px/700 .18em, padding `9px 12px`, radius 3px) + kicker (Bebas 14px .2em `#8a5f0a`); H1 `clamp(30px,3.8vw,52px)`/1.2, letter-spacing -.025em, `#0f2a1a`, balance (margin-top 20px); hàng meta (margin-top 28px, gap `12px 28px`, 14.5px `#435448`, icon forest 18px): lịch + ngày, đồng hồ + thời gian đọc, mầm lá + "Nguồn: VBFA" (nowrap).

**Ảnh bìa** — container chồng lên đầu bài bằng `margin-top: calc(-1 * clamp(44px,5.5vw,80px))`; khung cao `clamp(220px,35vw,520px)` (đừng dùng `aspect-ratio` kèm `min-height`, sẽ tràn ngang trên mobile), radius `0 clamp(40px,6vw,88px) 0 clamp(40px,6vw,88px)`, shadow `0 30px 70px rgba(11,46,26,.16)`, nền gradient placeholder; ảnh phủ kín (cover).

**Thân bài** — lưới `220px minmax(0,720px)`, `justify-content:center`, `column-gap:clamp(40px,6vw,88px)`, padding `clamp(44px,5.5vw,80px) gutter clamp(56px,7vw,96px)`; ≤1040px: một cột `minmax(0,720px)` và ẩn mục lục.
- **Mục lục** (sticky `top:112px`): nhãn "NỘI DUNG" (Bebas 14px/700 .22em forest); danh sách các H2 của bài, mỗi mục viền trái 2px `#e3e9de`, padding `10px 0 10px 18px`, 14.5px/1.5 `#435448`, chỉ số Bebas `#8a5f0a`; hover: chữ forest + viền trái amber. Bấm = cuộn mượt tới H2 (trừ 104px cho header), không đổi URL hash.
- **Đoạn dẫn**: `clamp(18px,1.6vw,21px)`/1.8, weight 500, `#11271a`; nội dung là phần tóm tắt (`excerpt`).
- **H2 trong bài**: số thứ tự tự động 01, 02, 03 (Bebas 24px/700 `#b07d17`) + tiêu đề `clamp(24px,2.3vw,30px)`/1.28 Mona SemiExp 600; margin-top `clamp(44px,5vw,64px)`; `scroll-margin-top:104px`; gap 16px.
- **Đoạn văn**: 17px/1.95 `#2f4236`, margin-top 18px (đoạn đầu sau H2: 22px).
- **Danh sách**: gạch đầu dòng vuông 9×9px amber radius `0 4px 0 4px`, gap dọc 14px, 17px/1.85; cụm đầu in đậm 600 `#0f2a1a`.
- **Hình trong bài**: tỉ lệ 16:9, radius 10px, chú thích 13.5px/1.6 `#5a6b5e` margin-top 12px.
- **Khối "Điểm chính"**: nền `#e5edd1`, radius 10px, padding `clamp(22px,3vw,32px)`, icon tile 48px radius `0 18px 0 18px` nền forest icon lime; nhãn "ĐIỂM CHÍNH" Bebas 14px/700 .22em forest; nội dung 16.5px/1.85 `#1b3a24`.
- **Chia sẻ**: hàng viền trên/dưới `1px #e3e9de`, padding 20px; nhãn "CHIA SẺ BÀI VIẾT"; hai nút pill 44px (viền `#c5d2c3`, chữ forest 14px/600): "Sao chép liên kết" (clipboard + toast) và "Gửi email" (`mailto:?subject=<tiêu đề>`).
- **Bài trước / Bài sau**: lưới `repeat(auto-fit,minmax(min(100%,300px),1fr))`, gap 16px; thẻ viền `#dfe7da` radius 10px padding `22px 24px`; nhãn Bebas 14px .2em `#8a5f0a` có mũi tên; tiêu đề Mona Sans 700 17px/1.4. Bài đầu tiên không có "Bài trước", bài cuối không có "Bài sau".

**Bài viết liên quan** — nền `#f4f6ec`, padding `clamp(56px,7vw,96px) 0`; hàng tiêu đề: eyebrow "Đọc thêm", H2 "Bài viết liên quan" `clamp(26px,2.7vw,38px)`, liên kết "Tất cả tin tức" → `/tin-tuc`. Lưới `repeat(auto-fill,minmax(min(100%,320px),1fr))`, gap `clamp(20px,2.4vw,32px)`, 3 thẻ: ảnh 16:9 nền gradient + giọt VBFA (`opacity:.55`, xoay 12°, góc phải dưới) + badge; ngày (Bebas 14px .2em `#8a5f0a`); H3 20px; link "Đọc tiếp". Chọn bài: ưu tiên cùng chuyên mục, bổ sung bằng chuyên mục khác, loại bài hiện tại, tối đa 3. Graphic nền: vân đồng mức ở góc trên phải (xem "Nền graphic").

### 4. Lớp phủ

Chung: lớp phủ cố định `inset:0`, z-index 100; bấm nền tối hoặc nhấn Esc để đóng; khi mở khóa cuộn trang (`body{overflow:hidden}`); focus nhảy vào phần tử `data-autofocus`, bẫy Tab trong hộp thoại, trả focus về nút đã mở khi đóng; `role="dialog" aria-modal="true"`.

**Menu mobile (drawer)** — nền tối `rgba(6,26,15,.62)`; drawer bên phải `width:min(100%,400px)`, nền trắng, padding `18px 28px 28px`, trượt vào `vbfaSlide .4s`. Đầu: logo cao 46px + nút đóng 44×44. Sáu hàng điều hướng: padding `18px 0`, viền dưới `1px #e2e8dd`, Mona Sans 500 21px `#0f2a1a` + chỉ số 01–06 (Bebas 14px .14em `#8a5f0a`); bấm hàng thì đóng menu và điều hướng. Đáy: nút forest full width "Đăng ký quan tâm hội viên" (min-height 54px, nội dung giãn hai đầu).

**Tìm kiếm** — nền `rgba(6,26,15,.66)` + `backdrop-filter:blur(4px)`; căn trên, padding-top `clamp(40px,12vh,120px)`; hộp `width:min(100%,660px)`, nền trắng, radius 14px, padding `clamp(24px,4vw,40px)`, shadow `0 40px 90px rgba(0,0,0,.35)`, vào bằng `vbfaPop .4s`. Nội dung: eyebrow "VBFA", H2 "Tìm kiếm nội dung" `clamp(24px,2.4vw,30px)`, đoạn mô tả 15px, nhãn "Từ khóa" 13px/600, input min-height 54px radius 8px (icon kính lúp trái, placeholder "Ví dụ: hội viên, chính sách, tin tức"), danh sách kết quả `aria-live="polite"` (hàng padding `16px 6px`, viền trên `1px #e3e9de`, Mona Sans 500 17px, mũi tên forest, hover nền `#f4f6ec`). Không nhập: 5 trang đầu. Có nhập: lọc theo tiêu đề trang và tiêu đề bài viết, không phân biệt hoa thường, hỗ trợ tiếng Việt có dấu (`toLocaleLowerCase('vi')`).

**Form kết nối hội viên** — hộp `width:min(100%,980px)`, `max-height:calc(100dvh - 40px)`, lưới `minmax(0,.78fr) minmax(0,1.5fr)`, radius 14px. Cột trái (ẩn ≤720px): gradient `#0a2314 → #154026`, vòng gợn, "VIETNAM BIOFUELS ASSOCIATION" (Bebas 13px/700 .24em lime), giọt cao 230px, "vì tương lai bền vững" (Primark 32px `#f2cf75`). Cột phải: padding `clamp(24px,3.4vw,44px)`, nút đóng 44px ở góc, H2 "Kết nối cùng VBFA" `clamp(24px,2.4vw,32px)`, đoạn mô tả, form lưới 2 cột gap 18px (1 cột ≤720px).

| Trường | Loại | Bắt buộc | Giới hạn |
|---|---|---|---|
| Họ và tên | text | có | 120 ký tự |
| Tổ chức / Doanh nghiệp | text | có | 160 ký tự |
| Email công việc | email | có | định dạng email |
| Số điện thoại | tel | không | |
| Nhu cầu kết nối (rộng 2 cột) | select: Quan tâm hội viên / Hợp tác chuyên môn / Đề nghị cung cấp thông tin / Khác | không | |
| Nội dung thêm (rộng 2 cột) | textarea min-height 104px | không | 1000 ký tự |
| Đồng ý sử dụng thông tin | checkbox 18px, accent forest | có | |

Input: min-height 48px, radius 6px, viền `#c5d2c3`, 15px; focus: viền forest + `0 0 0 3px rgba(150,185,73,.4)`. Nhãn 13px/600 `#0f2a1a`. Nút gửi "Gửi thông tin đăng ký": forest, min-height 52px, căn phải.

## Nền graphic

Quy tắc: **dải nền trắng và chân trang để sạch** (không có nền graphic); **mỗi dải nền màu có một hình riêng**, không lặp lại trong cùng một trang. Các lớp nằm sau nội dung (`position:absolute; z-index:-1; pointer-events:none`); section cha có `position:relative; overflow:hidden; isolation:isolate`. Mỗi lớp mang thuộc tính `data-gfx` để tìm và thay; tùy chọn `showGraphics` của prototype tắt tất cả.

**Nguồn hình**: không có hình nào lấy từ thư mục Drive (xem Open items). Lá xanh và giọt vàng được cắt từ artwork logo (phần giọt bị lá che trong logo được dựng lại bằng gradient). Mosaic ô lá và vân đồng mức do script tạo ra. Thay bằng file graphic chính thức khi nhận được, giữ nguyên vị trí và độ mờ ở bảng dưới. Trong prototype các tệp nằm ở `design_reference/assets/gfx/`; trong `code/` ở `code/assets/img/`.

| Dải | `data-gfx` | Tệp (`code/assets/img/`) | Vị trí, độ mờ, mặt nạ | Responsive |
|---|---|---|---|---|
| Hero trang chủ | `dots` + vòng gợn, giọt (dựng trong hero) | — | Lưới chấm 32px, chấm r 1.5 `#b2d25a` opacity .5, mặt nạ `radial-gradient(64% 120% at 80% 42%, #000, transparent 76%)`; khối hình xem "Hero: chuỗi chuyển động" | ≤1040px: `right:-110px; top:40%; width:440px; opacity:.34`; ≤720px: `width:380px; right:-150px; top:-40px; opacity:.2` |
| Đầu trang Tin tức | `dots`, `rings` | — | Lưới chấm mặt nạ `70% 140% at 84% 40%`; vòng gợn + giọt (cao 24% khung) trong khung vuông `width:min(72vw,820px)`, `right:-14%`, giữa dọc | ≤720px: `width:300px; right:-110px; top:30%; opacity:.3` |
| Lĩnh vực (nền `#f4f6ec`) | `contours` | `contours.svg` (1000×1000) | `right:-250px; top:-320px; width:740px`; mặt nạ `radial-gradient(closest-side, #000 50%, transparent 99%)` | ≤720px: `width:480px; right:-190px; top:-210px` |
| Hội viên (nền `#0e3320`) | `tiles` | `tiles-corner.svg` (1024×554) | `left:-40px; bottom:-40px; width:1000px`; mặt nạ `radial-gradient(ellipse 72% 96% at 0% 100%, #000 34%, transparent 100%)` | ≤1040px: `right:-40px; top:-30px; width:520px; rotate(180deg)` (tránh câu viết tay); ≤720px: `width:400px; right:-90px; top:-20px` |
| Bản tin (nền `#e5edd1`, mọi trang) | `gold` | `drop-gold.png` (503×819) | `right:6%; top:-40%; height:260%; opacity:.55; rotate(14deg)` | ≤720px: `height:125%; top:-28%; right:-70px; opacity:.5` |
| Đầu bài viết (nền `#f4f6ec`) | `leaf` | `leaf-green.png` (603×615) | `right:2%; top:-6%; height:104%; opacity:.2; rotate(8deg)` | ≤720px: `height:56%; right:-70px; top:-4%; opacity:.18` |
| Bài viết liên quan (nền `#f4f6ec`) | `contours` | `contours.svg` | Như dải Lĩnh vực (hình khác dải bản tin và đầu bài ngay cạnh) | Như dải Lĩnh vực |
| Về hiệp hội, Tin tức, Thư viện, danh sách bài, nội dung bài viết (nền trắng) | — | — | Để sạch | — |
| Chân trang | — | — | Không graphic (bỏ giọt mờ cũ để liên kết dễ đọc) | — |

**`contours.svg`**: 13 đường đồng mức khép kín quanh (500,500), bán kính 80 + 32k, méo nhẹ; nét `#1f5329` opacity .15 (.26 ở mỗi đường thứ 4); một đường chấm amber (`stroke-dasharray: 2 10`, opacity .6); ba nút màu (amber, leaf, amber). **`tiles-corner.svg`**: lưới 11×6 ô 84px, khe 10px, bo r34 ở hai góc đối diện (theo hình lá), mật độ giảm dần từ góc dưới trái; ô đặc `#2f7a4c`/`#3a8a58` opacity .09 – .30, ô viền `#96b949` opacity .42, hai ô nhấn amber `#e3a63a` .5 và lime `#b2d25a` .55. Cả hai là SVG thuần, có thể vẽ lại bằng token màu.

## Interactions & Behavior

**Điều hướng và cuộn**
- `html{scroll-behavior:smooth; scroll-padding-top:96px}`. Neo ở trang chủ cuộn mượt; chuyển trang cuộn tức thì về đầu.
- Nav trên trang chủ đánh dấu section đang xem bằng `IntersectionObserver` với `rootMargin:'-30% 0px -60% 0px'` trên `#top #about #focus #news #membership #resources #contact`.
- Header đổ bóng khi `scrollY > 12`; nút lên đầu trang hiện khi `scrollY > 640`; thanh tiến trình = `scrollY / (scrollHeight - innerHeight)`.

**Hover và chuyển động** (easing mặc định `cubic-bezier(.2,.8,.2,1)`)
- Nút: `transform` và `box-shadow` .35s, màu .25s; nhấn (`:active`) bỏ nâng và shadow.
- Thẻ lĩnh vực / thư viện: nâng 6px trong .5s; thẻ tin tức: shadow và viền .45s, ảnh phóng 1.045 trong .9s.
- Hàng "Về hiệp hội": nền và padding ngang .35s.
- Tiêu đề thẻ tin đổi màu forest .25s khi hover thẻ.
- Keyframes: `vbfaRise` (translateY 22px→0, opacity .55→1; trong production có thể bắt đầu từ opacity 0), `vbfaFade` (opacity .35→1, overlay .25s), `vbfaPop` (translateY 18px + scale .985 → 1, .4s), `vbfaSlide` (translateX 100%→0, .4s), `vbfaToast` (translateY 16px → 0, .4s), `vbfaSpin` (160s), `vbfaFloat` (7s). Hero thêm: `vbfaLine`, `vbfaDraw`, `vbfaWipe`, `vbfaWave`, `vbfaDrift`, `vbfaGlow`, `vbfaBob` (bảng bên dưới). Cuộn tới thêm: `vbfaUp` (translateY 20px→0, opacity 0→1, .8s; dùng chung cho mọi dải dưới hero, cùng `vbfaDraw` và `vbfaWipe` của hero; bảng trong mục "Chuyển động khi cuộn tới").
- `prefers-reduced-motion: reduce`: mọi animation/transition còn .01ms, cuộn không mượt.
- `@media (hover:none)`: bỏ hiệu ứng nâng thẻ.

**Focus**: `:focus-visible` → `outline:3px solid #e3a63a; outline-offset:3px`; input dùng ring `0 0 0 3px rgba(150,185,73,.4)` thay cho outline.

**Lọc tin trên trang chủ**: bấm chip thì đặt `filter`; thẻ không khớp mờ hoặc ẩn (xem mục Tin tức trang chủ).

**Trang Tin tức**: chip và ô tìm kiếm có tác dụng ngay khi gõ (không cần Enter); tìm trong tiêu đề + tóm tắt, không phân biệt chữ hoa/thường, hỗ trợ tiếng Việt có dấu; "Xem thêm" chỉ hiện khi không lọc và còn bài chưa hiển thị; "Xóa bộ lọc" đặt lại chip về Tất cả, xóa ô tìm kiếm.

**Form kết nối** (prototype): kiểm tra HTML5 (`reportValidity`); hợp lệ thì reset, đóng hộp thoại, hiện toast "Form thử nghiệm hợp lệ. Chưa có dữ liệu nào được gửi hoặc lưu." **Production**: gửi dữ liệu lên backend, trạng thái đang gửi (vô hiệu nút + spinner), thành công (đóng hộp + toast thật), lỗi mạng/máy chủ (giữ nguyên dữ liệu, thông báo lỗi trong hộp), chống spam (honeypot hoặc captcha), liên kết chính sách bảo mật trong dòng đồng ý. Nên rà soát câu đồng ý với bộ phận pháp lý (ví dụ quy định bảo vệ dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP nếu áp dụng).

**Bản tin**: input email bắt buộc; hợp lệ thì reset và hiện toast "Đã kiểm tra thao tác đăng ký. Chưa kết nối hệ thống gửi bản tin." (cần thay bằng luồng thật: xác nhận email, lỗi trùng/không hợp lệ).

**Sao chép liên kết**: ghi URL bài viết vào clipboard, toast "Đã sao chép liên kết bài viết."; nếu trình duyệt từ chối, toast "Không thể sao chép tự động. Hãy sao chép liên kết từ thanh địa chỉ."

**Responsive**

| Điều kiện | Thay đổi |
|---|---|
| ≤1040px | Ẩn nav chính, CTA header, các gạch đầu dòng ở dải hero, nhãn "Energy · Collaboration…"; hiện nút burger; hero art `opacity:.34`, `right:-110px`, `top:40%`, rộng 440px; trang Bài viết ẩn mục lục, thân bài một cột 720px |
| ≤900px | Footer thành 2 cột; cột logo và cột "Liên hệ" chiếm cả hàng |
| ≤720px | Ẩn utility bar, ngắt dòng H1 hero, liên kết "KHÁM PHÁ BÊN DƯỚI", cột trái của form kết nối; hero art 300px đặt đáy phải `opacity:.3`; nút hero xếp dọc; form kết nối 1 cột; H1 trang Tin tức bỏ giới hạn 62%; vòng gợn đầu trang Tin tức thu nhỏ |
| Linh hoạt | Hầu hết lưới dùng `auto-fit/auto-fill` với `minmax(min(100%,Npx),1fr)` nên tự xuống cột; flex-wrap cho hàng tiêu đề, thanh công cụ, meta |

Đã kiểm tra ở 390, 834, 1440 px: không tràn ngang. Mục tiêu chạm trên mobile tối thiểu 44px cho nút, chip, link thẻ, mục menu, link footer; link nav trên desktop cao khoảng 41px.

## Hero: chuỗi chuyển động

Easing mặc định `cubic-bezier(.2,.8,.2,1)`. Chỉ animate `transform`, `opacity`, `clip-path`. Mã tương ứng: prototype (`@keyframes vbfa*` trong `<helmet>`) và `code/assets/css/site.css` (khối Motion và Hero).

**Vào trang (chạy một lần)**

| # | Phần tử | Hiệu ứng | Thời lượng / trễ |
|---|---|---|---|
| 1 | Eyebrow | Hiện dần + trượt lên 22px; đường kẻ amber vẽ ra `scaleX 0→1` (gốc trái) | .9s / 0s; vạch .8s / .15s |
| 2 | H1 dòng 1 "Kết nối nguồn lực." | Trượt lên từ mặt nạ `translateY 108%→0` | 1s / .15s |
| 3 | H1 dòng 2 "Kiến tạo tương lai năng lượng xanh." | Như trên | 1s / .32s |
| 4 | Gạch chân "năng lượng xanh." | Vẽ ra `scaleX 0→1`, gradient `#e3a63a → #f2cf75`, cao 3px | .9s / 1.15s |
| 5 | Đoạn mô tả | Hiện dần + trượt lên | .9s / .55s |
| 6 | Hai nút | Hiện dần + trượt lên | .9s / .7s |
| 7 | Dải đáy | Hiện dần + trượt lên | .9s / .5s |
| 8 | "vì tương lai bền vững" (Primark) | Quét `clip-path: inset(0 100% 0 0) → inset(0 -3% 0 0)`, tạo cảm giác viết tay; easing `cubic-bezier(.6,0,.2,1)` | 1.6s / 1.1s |
| 9 | 3 gạch đầu dòng ở dải đáy | Hiện dần + trượt lên lần lượt | .8s / .95s, 1.05s, 1.15s |
| 10 | Khối hình bên phải | Hiện dần + trượt lên | 1.2s / .25s |

**Chạy liên tục (nền, tinh tế)**

| # | Phần tử | Hiệu ứng | Chu kỳ |
|---|---|---|---|
| 11 | Giọt VBFA | Lơ lửng `translate(-50%,-52%) ↔ (-50%,-48%)`, `ease-in-out`, `alternate` | 7s |
| 12 | Sóng lan (3 vòng viền `rgba(178,210,90,.6)` 1.5px, đường kính 46% khung) | `scale .5→2.3`, opacity `0 → .8 (tại 14%) → 0`, easing `cubic-bezier(.2,.6,.3,1)` | 7.2s; trễ .8s, 3.2s, 5.6s |
| 13 | Vòng đứt amber (r 308) | Quay 360° tuyến tính | 160s |
| 14 | Nút quỹ đạo, ba nhóm quanh tâm (310,310): r 170 (amber + trắng), r 224 (lime, đảo chiều), r 280 (amber + lime) | Quay 360° tuyến tính | 48s, 80s, 120s |
| 15 | Quầng sáng nền (phải) | Trôi `translate3d(-3%,2%) → (4%,-3%)`, `scale 1→1.1`, `alternate` | 16s |
| 16 | Lưới chấm | Opacity `.5 ↔ 1`, `alternate` | 7s |
| 17 | Mũi tên "Khám phá bên dưới" | Nhấp nhô `translateY 0 ↔ 4px` | 1.8s |

**Tương tác (parallax theo con trỏ)**

- Theo dõi `pointermove` trên cửa sổ; tính vị trí con trỏ trong hero thành `--hx`, `--hy` ∈ [−1, 1] đặt trên phần tử hero (throttle bằng `requestAnimationFrame`); ra ngoài hero thì về 0.
- Lớp A (quầng sáng, vòng, sóng, nút quỹ đạo): `translate3d(--hx × −12px, --hy × −9px, 0)`. Lớp B (giọt): `translate3d(--hx × 14px, --hy × 10px, 0)` (cùng chiều con trỏ, tạo chiều sâu). `transition: transform .8s`, `will-change: transform`.
- Chỉ bật khi `(hover: hover)` và không có `prefers-reduced-motion: reduce`.
- Dùng chung với hero trang Tin tức: lớp A và B nằm trong phần tử có `data-hero` (trang chủ: `<section id="top" data-hero>`; Tin tức: `<section class="page-head" data-hero>`).

**Giảm chuyển động**: khi `prefers-reduced-motion: reduce`, mọi animation và transition rút còn .01ms, chỉ lặp một lần, nên hero hiển thị ngay ở trạng thái cuối (sóng lan vô hình, nút quỹ đạo đứng yên); parallax tắt.

**Ghi chú triển khai**: dòng H1, gạch chân, chữ viết tay và vạch eyebrow dùng `animation-fill-mode: backwards`, trạng thái gốc của phần tử đã là trạng thái cuối, nên khi animation bị tắt nội dung vẫn đúng. Trình duyệt tạm dừng animation ở tab nền; hero chỉ hiện đầy đủ sau khi tab hiện lại. Trong React, đặt keyframes vào CSS toàn cục và chạy parallax trong `useEffect` (nhớ gỡ listener khi unmount). Khung ảnh chụp trong bảng mockup tắt animation để ra đúng trạng thái cuối.

## Chuyển động khi cuộn tới (mọi dải dưới hero)

Một bộ ba hiệu ứng dùng chung cho mọi dải dưới hero: phần tử cùng vai trò dùng cùng hiệu ứng, vào một lần theo thứ tự đọc rồi đứng yên. Không có vòng lặp nào ngoài hero. Chỉ animate `transform`, `opacity`, `clip-path`. Bảng review (nguyên tắc, token, lịch từng dải, so sánh trước/sau): `design_reference/VBFA Motion Review.dc.html`. Mã: prototype (`@keyframes vbfaUp/vbfaDraw/vbfaWipe` và khối `[data-rv]` trong `<helmet>`), `code/assets/css/site.css` (khối "Hiện dần khi cuộn tới") và `code/assets/js/site.js`.

**Token**

| Token | Giá trị |
|---|---|
| Đường cong | `cubic-bezier(.2,.8,.2,1)`; chữ viết tay `cubic-bezier(.6,0,.2,1)` |
| Khoảng dịch vào | 20px trượt lên, opacity 0 → 1 |
| Thời lượng | 0.8s; chữ viết tay 1.3s; vạch eyebrow 0.7s, trễ .12s |
| Nhịp trễ | `data-d="1..4"` = 0.08s / 0.16s / 0.24s / 0.32s |
| Kích hoạt | 20% phần tử vào khung nhìn, lề dưới −8%, chạy một lần |
| Gỡ hoạt ảnh | 2s sau `data-in` thêm `data-done` để hover chạy độc lập |

**Ba hiệu ứng (từ vựng thuộc tính)**

| Thuộc tính | Hiệu ứng | Dùng cho |
|---|---|---|
| `data-rv` (+ `data-d`) | Hiện + trượt lên 20px, 0.8s | Eyebrow, H2, đoạn, liên kết, hàng, thẻ, nút, bộ lọc, form, dải thông điệp |
| Vạch eyebrow (`::before` của `.eyebrow[data-rv]`; trong prototype là `<span data-rule>`) | `scaleX 0→1`, gốc trái, 0.7s, trễ .12s so với eyebrow | Mọi eyebrow |
| `data-rv="wipe"` | Quét mở `clip-path: inset(0 100% 0 0) → inset(0 -3% 0 0)`, 1.3s | Chỉ câu viết tay Primark ở dải Hội viên |

**Lịch theo dải** (số là `data-d`; mỗi phần tử tự kích hoạt nên hàng thẻ thứ hai chạy lại đúng nhịp khi cuộn tới)

| Dải | Phần tử |
|---|---|
| Về hiệp hội | Eyebrow 0, H2 1, liên kết 2; đoạn mô tả 1, ba hàng 2, 3, 4 |
| Lĩnh vực | Eyebrow 0, H2 1, đoạn 2; sáu thẻ 0, 1, 2, 0, 1, 2 |
| Tin tức | Eyebrow 0, H2 1, mô tả 2, bộ lọc 2; bài nổi bật 0, hai bài còn lại 1, 2 |
| Hội viên | Eyebrow 0, H2 1, đoạn 2, nút 3; ba điểm 1, 2, 3; câu viết tay `wipe` 4 |
| Thư viện | Eyebrow 0, H2 1 (hai dòng ngắt bằng `<br>`), mô tả 2; hai thẻ 0, 1; dải thông điệp 0 |
| Bản tin (mọi trang) | Cột chữ 0, form 1 |

Chuỗi dài nhất 1.62s (câu viết tay); các phần tử khác tối đa 1.12s.

**Cơ chế kích hoạt**

- Mỗi `[data-rv]` được `IntersectionObserver` theo dõi (`threshold: .2`, `rootMargin: '0px 0px -8% 0px'`). Khi vào khung nhìn: thêm `data-in` (chạy một lần, cuộn lên xuống không chạy lại), 2s sau thêm `data-done`.
- Trước `data-in`: `opacity:0`. Bản `code/` chỉ ẩn khi `<html class="js">` nên không có JS thì nội dung vẫn hiện. `[data-rv]:not([data-done]){transition:none!important}` để transition hover không xung đột lúc vào.
- Hiện ngay (đặt sẵn `data-in` và `data-done`, không hoạt ảnh) khi: `prefers-reduced-motion: reduce`; không có `IntersectionObserver`; trang tải trong tab ẩn (`document.visibilityState === 'hidden'`, vì observer không chạy ở tab ẩn); sự kiện `beforeprint` (in, xuất PDF).
- Hover (chỉ `(hover: hover)`): một kiểu chung cho thẻ: nâng 6px, đổ bóng, ô icon đổi nền forest, nút tròn đổi nền forest, mũi tên dịch chéo, thanh đáy `scaleX 0→1`. Không còn nét icon vẽ lại, sóng nút tròn hay lắc lá.

## Hero trang Tin tức: chuỗi chuyển động

Cùng họ với hero trang chủ (cùng easing và hiệu ứng), nhẹ hơn ở phần nền. Chạy khi tải trang, không phụ thuộc cuộn. Mã: prototype (`<section data-hero>` đầu view Tin tức), `code/assets/css/site.css` (khối "Đầu trang Tin tức").

| # | Phần tử | Hiệu ứng | Thời lượng / trễ |
|---|---|---|---|
| 1 | Breadcrumb | Hiện dần + trượt lên 22px | .9s / 0s |
| 2 | Eyebrow "Tin tức & góc nhìn" | Hiện dần + trượt lên; vạch amber vẽ ra | .9s / .08s; vạch .8s / .2s |
| 3 | H1 dòng 1 "Chuyển động ngành," | Trượt lên từ mặt nạ `translateY 108%→0` | 1s / .15s |
| 4 | H1 dòng 2 "góc nhìn mới." | Như trên | 1s / .32s |
| 5 | Gạch chân "góc nhìn mới." | Vẽ ra `scaleX 0→1`, gradient `#e3a63a → #f2cf75`, cao 3px | .9s / 1.15s |
| 6 | Đoạn mô tả | Hiện dần + trượt lên | .9s / .55s |
| 7 | Khối hình (vòng gợn + giọt) | Hiện dần + trượt lên | 1.2s / .25s |

Chạy liên tục (5 vòng lặp, so với 11 của hero trang chủ): giọt lơ lửng 7s; hai sóng lan 7.2s (trễ .8s và 4.4s); vòng đứt amber quay 160s; lưới chấm sáng tối 7s. Đã bỏ: ba nhóm nút quỹ đạo, quầng sáng trôi, mũi tên nhấp nhô, sóng thứ ba. Parallax con trỏ dùng chung với hero trang chủ (lớp vòng ngược chiều 12px, lớp giọt cùng chiều 14px), gắn vào phần tử có `data-hero`.

**Ghi chú triển khai chung**

- Hiệu ứng vào dùng `animation-fill-mode: backwards`; trạng thái gốc của phần tử đã là trạng thái cuối nên khi animation bị tắt nội dung vẫn đúng.
- Trình duyệt tạm dừng animation ở tab nền: hero chỉ hiện đầy đủ sau khi tab hiện lại. Muốn xem hoạt ảnh khi kiểm thử, tải trang ở tab đang hiển thị rồi cuộn.
- Trong React: giữ `data-in` / `data-done` bằng state hoặc ref, gỡ observer khi unmount; khi đổi route cần quan sát lại các phần tử mới (prototype gọi `initReveal()` sau mỗi lần đổi view).
- Khác biệt cố ý: `@keyframes vbfaRise` trong prototype bắt đầu từ opacity .55 để ảnh chụp không bị trống; bản `code/` bắt đầu từ 0.

## State Management

Prototype giữ toàn bộ trong một component; trong production tách theo nhu cầu (URL, server, state cục bộ).

| State | Giá trị | Ghi chú |
|---|---|---|
| `view` | `home` \| `news` \| `article` | Suy ra từ route |
| `slug` | slug bài viết | Từ route; không tìm thấy thì 404 |
| `nf` | `all` \| `news` \| `activity` \| `policy` | Chuyên mục trang Tin tức; đưa lên query |
| `nq` | chuỗi | Từ khóa trang Tin tức; đưa lên query |
| `more` | boolean | Đã bấm "Xem thêm" |
| `filter` | như `nf` | Chip ở khối tin trên trang chủ (chỉ cục bộ) |
| `menu` | boolean | Drawer mở |
| `modal` | `null` \| `search` \| `join` | Hộp thoại mở |
| `q` | chuỗi | Từ khóa hộp tìm kiếm |
| `scrolled`, `showTop` | boolean | Từ `scrollY` |
| `active` | id section | Từ IntersectionObserver, chỉ ở trang chủ |
| `toast` | chuỗi | Rỗng thì ẩn; tự xóa sau 4.5s |

Chuyển trạng thái chính: mở menu/tìm kiếm/form đóng cái còn lại; đóng bằng Esc, bấm nền, nút đóng, hoặc chọn liên kết; mở form từ menu thì menu đóng; đổi `nf` hoặc `nq` thì `more=false`.

Dữ liệu cần lấy: danh sách bài viết (trang chủ 3 bài mới nhất, trang Tin tức toàn bộ có phân trang hoặc xem thêm, chi tiết theo slug, liên quan theo chuyên mục). Tìm kiếm toàn site: chỉ mục trang tĩnh + bài viết.

## Data model

```ts
type Category = 'news' | 'activity' | 'policy';        // Tin ngành | Hoạt động | Chính sách

interface Article {
  slug: string;              // ví dụ 'dong-luc-tuong-lai'
  category: Category;
  kicker: string;            // 'TIN NGÀNH · GÓC NHÌN' (nhãn phụ, in hoa)
  publishedAt: string;       // ISO; hiển thị dd/MM/yyyy
  readingMinutes: number;    // hiển thị 'N phút đọc'
  title: string;
  excerpt: string;           // tóm tắt, cũng là đoạn dẫn của bài
  cover?: Image;             // ảnh bìa; thẻ danh sách dùng ảnh riêng hoặc crop từ bìa (16:10)
  body: Block[];
}

type Block =
  | { type: 'heading'; text: string }                   // H2, số thứ tự và mục lục tự sinh
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: { lead?: string; text: string }[] }
  | { type: 'figure'; image: Image; caption?: string }
  | { type: 'callout'; text: string };                  // khối "Điểm chính"
```

Trường dẫn xuất: tên chuyên mục (`news`→"Tin ngành", `activity`→"Hoạt động", `policy`→"Chính sách"); badge (`VBFA / INSIGHTS`, `VBFA / COMMUNITY`, `VBFA / POLICY`); gradient placeholder theo `index % 3`. Dữ liệu mẫu: `reference/articles.sample.json` (10 bài).

SEO bài viết: `<title>` = "{title} | VBFA", meta description = excerpt, Open Graph (title, description, ảnh bìa), JSON-LD `NewsArticle` (headline, datePublished, image, publisher VBFA).

## Component inventory (gợi ý)

`ScrollProgress`, `SkipLink`, `UtilityBar`, `SiteHeader` (+ `NavLink`, `HeaderCta`, `Burger`), `MobileMenu`, `SearchDialog`, `JoinDialog` (+ form fields), `Toast`, `BackToTop`, `Eyebrow`, `Button` (variants: forest, lime, outlineLight, outlineDark, link), `Chip`, `IconTile`, `GraphicLayer` (dots / rings / drop), `PageHeader` (dark band + breadcrumb), `Breadcrumb`, `HeroSection`, `AboutSection`, `FocusCard`, `ArticleCard` (variants: homeFeatured, homeCompact, listFeatured, listGrid, related), `NewsToolbar`, `Prose` (heading/paragraph/list/figure/callout), `TableOfContents`, `ShareBar`, `PrevNext`, `NewsletterBand`, `SiteFooter`. Thêm: `RevealGroup` (IntersectionObserver, đặt `data-in` rồi `data-done`).

## Design Tokens

Đầy đủ trong `reference/design-tokens.css` (CSS variables + `@font-face`). Tóm tắt:

**Màu thương hiệu** (lấy mẫu từ logo): forest `#1f5329`, deep `#0b2616`, leaf `#96b949`, lime `#b2d25a`, amber `#e3a63a`, gold `#f2cf75`. Nền: trắng, paper `#f4f6ec`, leaf tint `#e5edd1`, tile `#e6eed2`. Chữ: heading `#0f2a1a`, gốc `#11271a`, đoạn `#435448`, bài viết `#2f4236`, phụ `#5a6b5e`. Chữ trên nền tối: `#ffffff`, `#d4e4d3`, `#cfe0cf`, `#b9ceb9`, `#a9c0ab`.

**Font** (tự host, không dùng Google Fonts):
| Vai trò | Font | Trọng số dùng |
|---|---|---|
| H1, H2 | Mona Sans SemiExpanded | 600 |
| H3, tiêu đề hàng, tiêu đề thẻ | Mona Sans | 500, 700 |
| Eyebrow, kicker, badge, chỉ mục, nhãn | SVN-Bebas Neue Pro SemiExpanded | 400, 700 (Bebas Neue Pro Bold dự phòng) |
| Câu ký (từ 28px trở lên) | SVN-Primark | 400 |
| Văn bản web, nút, input | Be Vietnam Pro | 400, 500, 600, 700 |

**Cỡ chữ (resolve ở 1440 px)**: H1 hero 59.04px/69.7px; H2 41.76px/51.8px; H3 thẻ lĩnh vực 21px/28.35px; H3 tin nổi bật trang chủ 28px/37.5px; đoạn Về hiệp hội 18px/34.2px; hàng "Về hiệp hội" 20px/29px; nav 14.5px/24.65px; nút 15px/25.5px; link footer 15px/25.5px; eyebrow 14px, letter-spacing 3.08px; kicker 14px, letter-spacing 2.8px.

**Khoảng cách** (thang quan sát): 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 128px; gutter `clamp(20px,4vw,48px)`; section `clamp(72px,9vw,128px)`.

**Bo góc**: 3px (badge), 6px (nút, input), 8px (nút icon, input trong hộp thoại), 10px (thẻ), 14px (hộp thoại), 999px (chip, pill), 50% (nút tròn), cắt lá `0 22px 0 22px` (icon tile), `0 18px 0 18px` (icon callout), `0 4px 0 4px` (gạch đầu dòng), `0 140px 0 140px` (khung ảnh hero), `0 clamp(40px,6vw,88px) 0 clamp(40px,6vw,88px)` (ảnh bìa).

**Đổ bóng**: header `0 12px 32px rgba(11,38,22,.09)`; thẻ hover `0 26px 60px rgba(11,46,26,.12)`; thẻ tin hover `0 24px 56px rgba(11,46,26,.11)`; nút hover `0 14px 30px rgba(6,30,16,.2)`; ảnh bìa `0 30px 70px rgba(11,46,26,.16)`; hộp thoại `0 40px 90px rgba(0,0,0,.35)`; toast `0 20px 50px rgba(0,0,0,.32)`; nút lên đầu trang `0 12px 28px rgba(8,38,20,.3)`.

**Chuyển động**: easing `cubic-bezier(.2,.8,.2,1)`; thời lượng .25s, .3s, .35s, .4s, .45s, .5s, .9s.

**z-index**: header 60, nút lên đầu 70, lớp phủ 100, toast 130, thanh tiến trình 140, skip link 200.

## Accessibility

- Landmark: `header`, `nav` (có `aria-label`), `main#main`, `footer`; skip link; chỉ một H1 mỗi trang; thứ tự H2 → H3 hợp lý.
- Trạng thái: `aria-current` trên nav và breadcrumb, `aria-pressed` trên chip, `aria-expanded` trên burger, `aria-live="polite"` cho số kết quả và danh sách tìm kiếm, `role="status"` cho toast.
- Hộp thoại: `role="dialog" aria-modal="true"` + `aria-labelledby`, bẫy focus, Esc, trả focus.
- Ảnh trang trí `alt=""` và `aria-hidden`; logo có alt "VBFA - Hiệp hội Nhiên liệu Sinh học Việt Nam".
- Mục tiêu chạm trên mobile ≥ 44px; `:focus-visible` rõ; tôn trọng `prefers-reduced-motion`.
- Tỉ lệ tương phản đã tính (WCAG, chữ thường cần 4.5:1):

| Cặp | Tỉ lệ |
|---|---|
| `#11271a` / trắng | 15.80 |
| `#0f2a1a` / trắng | 15.37 |
| `#435448` / trắng | 8.08 |
| `#2f4236` / trắng | 10.75 |
| `#5a6b5e` / trắng | 5.68 |
| `#5a6b5e` / `#f4f6ec` | 5.20 |
| `#8a5f0a` / trắng | 5.64 |
| `#8a5f0a` / `#e5edd1` | 4.67 |
| `#b07d17` / trắng (chỉ cho số 24px trở lên) | 3.63 |
| `#1f5329` / trắng | 9.02 |
| `#1f5329` / `#f4f6ec` | 8.27 |
| `#1f5329` / `#e5edd1` | 7.46 |
| trắng / `#1f5329` (nút) | 9.02 |
| `#0b2616` / `#b2d25a` (nút lime) | 9.41 |
| `#b2d25a` / `#0b2616` | 9.41 |
| `#d4e4d3` / `#0b2616` | 12.15 |
| `#b9ceb9` / `#0b2616` | 9.66 |
| `#a9c0ab` / `#0b2616` | 8.30 |
| `#cfe0cf` / `#0b2616` | 11.68 |
| `#f2cf75` / `#0b2616` | 10.71 |
| `#1b3a24` / `#e5edd1` | 10.35 |

Quy tắc: amber trên nền sáng cho chữ nhỏ phải dùng `#8a5f0a`; `#b07d17` chỉ dùng cho số lớn (24px trở lên).

## Assets

| File | Dùng ở | Nguồn |
|---|---|---|
| `assets/vbfa-logo.png` (1255×516) | Header, drawer | Cắt từ prototype V4 (logo thương hiệu) |
| `assets/vbfa-logo-white-solid.png` (1255×516) | Footer | Bản logo trắng đã làm đặc từ `vbfa-logo-white.png` để nổi trên nền xanh đậm |
| `assets/vbfa-drop-solid.png` (618×888) | Hero, đầu trang Tin tức, form kết nối, thumbnail bài liên quan | Giọt VBFA, làm đặc từ `vbfa-drop.png` |
| `assets/img/contours.svg` (1000×1000) | Nền dải Lĩnh vực và Bài viết liên quan | Do script tạo (đường đồng mức, nét `#1f5329`); thay bằng artwork chính thức khi có |
| `assets/img/tiles-corner.svg` (1024×554) | Nền dải Hội viên | Do script tạo (ô bo hai góc đối diện theo hình lá) |
| `assets/img/leaf-green.png` (603×615) | Nền đầu bài viết | Lá xanh cắt từ `vbfa-drop-solid.png` |
| `assets/img/drop-gold.png` (503×819) | Nền dải bản tin | Giọt vàng cắt từ `vbfa-drop-solid.png`; phần bị lá che dựng lại bằng gradient |
| `assets/vbfa-drop.png`, `vbfa-logo-white.png`, `vbfa-logo-t.png` | Bản gốc để đối chiếu | V4 |

Các PNG gốc có độ trong suốt một phần nên bị tối trên nền xanh đậm; bản `-solid` chỉ là giải pháp tạm. **Thay bằng SVG logo chính thức** (có trong thư mục Drive, file zip SVG 52 MB) và dùng cho favicon, ảnh chia sẻ mạng xã hội.

Ảnh nội dung (khung `image-slot` trong prototype) cần thay bằng ảnh thật:

| Vị trí | Id khung | Tỉ lệ / kích thước |
|---|---|---|
| Ảnh hero (biến thể photo) | `hero-photo` | khung vuông `clamp(320px,42vw,620px)`, cắt lá |
| Thẻ tin: bài 1, 2, 3 (dùng chung giữa trang chủ và trang Tin tức) | `news-featured`, `news-activity`, `news-policy` | 16:10 (nổi bật trang chủ cao tối thiểu 260px; nổi bật trang Tin tức cao `clamp(260px,30vw,420px)`) |
| Thẻ tin: bài 4–10 | `news-a4` … `news-a10` | 16:10 |
| Ảnh bìa bài viết | `cover-1` … `cover-10` | cao `clamp(220px,35vw,520px)` (xấp xỉ 21:9 trên desktop), rộng tối đa 1184px |
| Ảnh minh họa trong bài | `figure-1` … `figure-10` | 16:9, rộng tối đa 720px |

Gợi ý xuất ảnh: rộng 1600–2400px cho bìa, 1200px cho thẻ, WebP/AVIF, `sizes` theo lưới.

**Font**: 12 file trong `design_reference/fonts/`. Mona Sans và Be Vietnam Pro phát hành theo giấy phép mở (SIL OFL). **SVN-Bebas Neue Pro và SVN-Primark: cần xác nhận giấy phép dùng làm web font (self-host) với chủ sở hữu hoặc đơn vị cung cấp trước khi đưa lên production.** Nếu không được phép, dùng font thay thế từ guideline (Bebas Neue, một font viết tay tương tự).

**Icon**: vẽ tay dạng inline SVG trong HTML (xem mục Quy ước chung).

## Open items

1. **Nền graphic chính thức**: các file zip trong Drive (SVG 52 MB, thư mục guideline 31 MB) và các trang 12–21 của guideline PDF chưa được đọc. Công cụ đọc Drive từ chối file trên 10 MB (đã thử với zip 31 MB), và các trang 12–21 của PDF chỉ chứa hình, không có chữ để trích. Cần gửi từng file PNG/SVG/JPG (2–3 hình là đủ), rồi thay vào các lớp `data-gfx`.
2. **Bảng màu**: xác nhận các giá trị lấy mẫu từ logo với trang bảng màu của guideline.
3. **Nội dung**: tiêu đề bài 4–10, ngày đăng, thời gian đọc, thân bài mẫu cần thay bằng nội dung biên tập thật.
4. **Câu chữ chỉ dành cho prototype** cần viết lại: thông báo toast của form và bản tin, câu đồng ý trong form ("…khi hệ thống chính thức được vận hành."), dòng "Không thấy khu vực phù hợp trong bản mẫu." ở hộp tìm kiếm.
5. **Trang chưa thiết kế**: Về VBFA, chi tiết từng lĩnh vực, Hội viên (đăng ký và quyền lợi), Thư viện (danh mục tài liệu), Liên hệ. Hiện các nút trỏ vào neo của trang chủ hoặc mở form kết nối.
6. **Ngôn ngữ**: chưa có bản tiếng Anh; một số nhãn đang bằng tiếng Anh theo thiết kế (`VBFA / INSIGHTS`, "Energy · Collaboration · Sustainability").
7. **Chọn một**: lọc tin trang chủ dạng mờ (`dim`) hay ẩn (`hide`).
8. **Giấy phép font** SVN-Bebas Neue Pro và SVN-Primark.
9. **Backend**: form kết nối, bản tin, tìm kiếm toàn site, phân tích truy cập chưa có.

## Gợi ý thứ tự triển khai

1. Khởi tạo dự án, nạp `design-tokens.css`, font, layout khung (header, footer, utility bar, skip link, thanh tiến trình).
2. Drawer menu, nút lên đầu trang, toast, `Button`, `Chip`, `Eyebrow`, `IconTile`, `GraphicLayer`.
3. Trang chủ theo thứ tự section; đối chiếu với `design_reference` ở 1440 và 390px.
4. Trang Tin tức: thẻ bài viết, lọc và tìm kiếm theo query URL, xem thêm.
5. Trang Bài viết: `Prose`, mục lục, chia sẻ, bài trước/sau, bài liên quan, SEO.
6. Hộp thoại tìm kiếm và form kết nối + backend.
7. Nối CMS, thay nội dung mẫu bằng nội dung thật; thay ảnh và graphic chính thức.
8. Kiểm thử: bộ độ rộng 390 / 834 / 1440 (và 1040, 900, 720 quanh các breakpoint), bàn phím, trình đọc màn hình, `prefers-reduced-motion`, Lighthouse (Performance, Accessibility, SEO), so sánh hình ảnh với prototype.

## Files

```
design_handoff_vbfa_website/
├── README.md                          (file này)
├── code/                              Bản dựng chạy được (HTML + CSS + JS thuần), xem code/README.md
│   ├── index.html                     Trang chủ
│   ├── tin-tuc/index.html             Danh sách tin tức
│   ├── tin-tuc/<slug>/index.html      10 bài viết mẫu
│   └── assets/ { css/tokens.css, css/site.css, js/site.js, js/articles-data.js, img/, fonts/ }
├── screenshots/                       Ảnh chụp thiết kế (PNG), xem danh sách bên dưới
├── docs/
│   └── content-inventory.md           Toàn bộ chuỗi hiển thị, đích liên kết, hành động nút, bảng bài viết mẫu
├── reference/
│   ├── design-tokens.css              CSS variables + @font-face (đường dẫn font tính từ design_reference/)
│   └── articles.sample.json           10 bài viết mẫu (mô hình dữ liệu)
└── design_reference/                  Prototype HTML (chỉ để tham chiếu)
    ├── VBFA Website.dc.html           Website: trang chủ, Tin tức, Bài viết, overlay, hoạt ảnh hero (nguồn chính của thiết kế)
    ├── VBFA UI Mockups.dc.html        Bảng mockup: desktop, tablet, mobile, overlay, nền graphic, nền tảng UI
    ├── VBFA Motion Review.dc.html     Bảng review chuyển động: nguyên tắc, token, lịch từng dải, so sánh trước/sau
    ├── support.js, image-slot.js      Runtime của prototype (không port)
    ├── assets/                        Logo, giọt VBFA (PNG) và nền graphic (assets/gfx/)
    └── fonts/                         12 file font đã dùng
```

**Ảnh chụp (`screenshots/`)**: chụp từ prototype, trạng thái cuối của hoạt ảnh.

| File | Nội dung | Kích thước |
|---|---|---|
| `01-home-desktop-1440.png` | Trang chủ, toàn trang | 1440 px, 1x |
| `02-home-tablet-834.png` | Trang chủ, toàn trang | 834 px, 1x |
| `03-home-mobile-390.png` | Trang chủ, toàn trang | 390 px, 1x |
| `04-news-desktop-1440.png`, `05-news-tablet-834.png`, `06-news-mobile-390.png` | Trang Tin tức (trạng thái mặc định) | 1x |
| `07-article-desktop-1440.png`, `08-article-mobile-390.png` | Trang Bài viết | 1x |
| `09-overlay-join-desktop.png`, `10-overlay-search-desktop.png`, `11-overlay-menu-mobile.png` | Form kết nối, tìm kiếm, menu mobile | 2x |
| `12-hero-desktop-2x.png` | Hero trang chủ ở 1440 px | 2x |
| `13-ui-foundations.png` | Màu, font, thành phần, họa tiết | 2x |
| `14-graphic-backgrounds.png` | Nền graphic theo từng dải (hero, Lĩnh vực, Hội viên, bản tin, đầu bài viết, bài liên quan, dải để sạch, chân trang) | 1x |

Ảnh chụp không thể hiện chuyển động; dùng các mục "Hero: chuỗi chuyển động", "Chuyển động khi cuộn tới", "Hero trang Tin tức: chuỗi chuyển động" và prototype để xem hoạt ảnh. Khung ảnh bài viết trong ảnh là placeholder.

Đồng bộ: nếu thiết kế thay đổi, `design_reference/VBFA Website.dc.html` là nguồn chuẩn; `docs/content-inventory.md` và `reference/articles.sample.json` được sinh từ file này; `code/` được dựng theo prototype và cần cập nhật tay khi thiết kế đổi.
