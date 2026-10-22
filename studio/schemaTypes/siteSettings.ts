import { defineField, defineType } from 'sanity';

const text = (name: string, title: string, description?: string, rows?: number) =>
  defineField({ name, title, type: rows ? 'text' : 'string', rows, description, validation: (r) => r.required() });

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Thông tin chung · Biểu mẫu · SEO mặc định',
  type: 'document',
  groups: [
    { name: 'identity', title: 'Nhận diện', default: true },
    { name: 'footer', title: 'Chân trang & bản tin' },
    { name: 'forms', title: 'Biểu mẫu' },
    { name: 'seo', title: 'SEO mặc định' },
  ],
  fields: [
    defineField({ name: 'name', title: 'Tên ngắn', type: 'string', group: 'identity', initialValue: 'VBFA', validation: (r) => r.required() }),
    defineField({ name: 'legalName', title: 'Tên đầy đủ (tiếng Việt)', type: 'string', group: 'identity', initialValue: 'Hiệp hội Nhiên liệu Sinh học Việt Nam', validation: (r) => r.required() }),
    defineField({ name: 'englishName', title: 'Tên tiếng Anh', type: 'string', group: 'identity', initialValue: 'Vietnam Biofuels Association', validation: (r) => r.required() }),
    defineField({ name: 'utilityLeft', title: 'Thanh trên cùng · bên trái', type: 'string', group: 'identity', validation: (r) => r.required() }),
    defineField({ name: 'utilityRight', title: 'Thanh trên cùng · bên phải', type: 'string', group: 'identity', validation: (r) => r.required() }),
    defineField({
      name: 'contact',
      title: 'Liên hệ chính thức',
      type: 'object',
      group: 'identity',
      description: 'Chỉ điền thông tin đã được hiệp hội xác nhận. Dùng cho dữ liệu có cấu trúc (Google).',
      fields: [
        defineField({ name: 'email', title: 'Email', type: 'string', validation: (r) => r.email() }),
        defineField({ name: 'phone', title: 'Điện thoại', type: 'string' }),
        defineField({ name: 'address', title: 'Địa chỉ trụ sở', type: 'text', rows: 2 }),
      ],
    }),
    defineField({ name: 'social', title: 'Kênh mạng xã hội chính thức', type: 'array', group: 'identity', of: [{ type: 'url', validation: (r) => r.uri({ scheme: ['https'] }) }] }),

    text('footerBlurb', 'Mô tả dưới logo (chân trang)', undefined, 2),
    { ...text('footerContact', 'Đoạn "Liên hệ" ở chân trang', undefined, 3), group: 'footer' },
    { ...text('footerContactCta', 'Nút "Liên hệ" ở chân trang'), group: 'footer' },
    defineField({
      name: 'newsletter',
      title: 'Dải đăng ký bản tin',
      type: 'object',
      group: 'footer',
      fields: [
        defineField({ name: 'title', title: 'Tiêu đề', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'description', title: 'Mô tả', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'placeholder', title: 'Gợi ý trong ô email', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'button', title: 'Chữ nút', type: 'string', validation: (r) => r.required() }),
      ],
    }),

    defineField({
      name: 'forms',
      title: 'Biểu mẫu kết nối & thông báo',
      type: 'object',
      group: 'forms',
      fields: [
        defineField({ name: 'joinTitle', title: 'Tiêu đề biểu mẫu hội viên', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'joinIntro', title: 'Mô tả biểu mẫu', type: 'text', rows: 2, validation: (r) => r.required() }),
        defineField({ name: 'consentText', title: 'Câu đồng ý sử dụng thông tin', type: 'text', rows: 3, description: 'Cần pháp chế rà soát theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025/NĐ-CP (hiệu lực 01/01/2026). Mỗi lần sửa nội dung, hãy tăng "Phiên bản" bên dưới.', validation: (r) => r.required() }),
        defineField({ name: 'consentVersion', title: 'Phiên bản câu đồng ý', type: 'string', description: 'Ví dụ: join-v2 → join-v3. Được lưu cùng mỗi lượt đăng ký để chứng minh người dùng đã đồng ý nội dung nào.', validation: (r) => r.required().max(40) }),
        defineField({ name: 'joinSuccess', title: 'Thông báo khi gửi biểu mẫu thành công', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'newsletterSuccess', title: 'Thông báo khi đăng ký bản tin thành công', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'genericError', title: 'Thông báo lỗi chung', type: 'string', validation: (r) => r.required() }),
        defineField({ name: 'privacyPage', title: 'Trang "Chính sách bảo mật"', type: 'reference', to: [{ type: 'page' }], description: 'Khi chọn, câu đồng ý sẽ có liên kết tới trang này.' }),
      ],
    }),

    defineField({ name: 'seo', title: 'SEO mặc định', type: 'seo', group: 'seo' }),
  ],
  preview: { prepare: () => ({ title: 'Thông tin chung · Biểu mẫu · SEO mặc định' }) },
});
