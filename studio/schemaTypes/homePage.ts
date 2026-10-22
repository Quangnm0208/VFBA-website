import { defineArrayMember, defineField, defineType } from 'sanity';

const req = (name: string, title: string, type: 'string' | 'text' = 'string', extra: Record<string, unknown> = {}) =>
  defineField({ name, title, type, ...(type === 'text' ? { rows: 3 } : {}), validation: (r) => r.required(), ...extra });

const ICONS = [
  { title: 'Cân (chính sách)', value: 'scales' },
  { title: 'Biểu đồ', value: 'chart' },
  { title: 'Bình thí nghiệm', value: 'flask' },
  { title: 'Mầm lá', value: 'sprout' },
  { title: 'Sách', value: 'book' },
  { title: 'Quả địa cầu', value: 'globe' },
  { title: 'Tài liệu', value: 'document' },
];
const icon = defineField({ name: 'icon', title: 'Biểu tượng', type: 'string', options: { list: ICONS, layout: 'dropdown' }, validation: (r) => r.required() });
const cta = (name: string, title: string) => defineField({ name, title, type: 'cta', validation: (r) => r.required() });

export const homePage = defineType({
  name: 'homePage',
  title: 'Trang chủ',
  type: 'document',
  groups: [
    { name: 'hero', title: 'Hero', default: true },
    { name: 'about', title: 'Về hiệp hội' },
    { name: 'focus', title: 'Lĩnh vực' },
    { name: 'news', title: 'Tin tức' },
    { name: 'membership', title: 'Hội viên' },
    { name: 'resources', title: 'Thư viện' },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    defineField({
      name: 'hero',
      title: 'Hero',
      type: 'object',
      group: 'hero',
      fields: [
        req('eyebrow', 'Nhãn nhỏ phía trên'),
        req('line1', 'Tiêu đề · dòng 1'),
        req('line2Prefix', 'Tiêu đề · dòng 2 (phần thường)'),
        req('highlight', 'Tiêu đề · cụm nhấn màu', 'string', { description: 'Cụm chữ màu lime có gạch chân vẽ ra.' }),
        req('lead', 'Đoạn mô tả', 'text'),
        cta('primaryCta', 'Nút chính'),
        cta('secondaryCta', 'Nút phụ'),
        req('microLabel', 'Dòng nhãn dưới hình giọt'),
        req('stripLabel', 'Dải đáy · chữ in hoa'),
        req('stripScript', 'Dải đáy · chữ viết tay'),
        defineField({ name: 'stripPoints', title: 'Dải đáy · 3 gạch đầu dòng', type: 'array', of: [{ type: 'string' }], validation: (r) => r.required().length(3) }),
        req('stripCue', 'Dải đáy · liên kết cuộn'),
      ],
    }),
    defineField({
      name: 'about',
      title: 'Về hiệp hội',
      type: 'object',
      group: 'about',
      fields: [
        req('eyebrow', 'Nhãn'),
        req('title', 'Tiêu đề', 'text'),
        cta('link', 'Liên kết dưới tiêu đề'),
        req('lead', 'Đoạn dẫn', 'text'),
        defineField({ name: 'rows', title: '3 hàng liên kết', type: 'array', of: [{ type: 'cta' }], validation: (r) => r.required().length(3) }),
      ],
    }),
    defineField({
      name: 'focus',
      title: 'Lĩnh vực trọng tâm',
      type: 'object',
      group: 'focus',
      fields: [
        req('eyebrow', 'Nhãn'),
        req('title', 'Tiêu đề'),
        req('description', 'Mô tả', 'text'),
        req('kickerPrefix', 'Tiền tố nhãn thẻ', 'string', { initialValue: 'CHỦ ĐỀ', description: 'Hiện thành "CHỦ ĐỀ / 01".' }),
        defineField({
          name: 'cards',
          title: 'Thẻ lĩnh vực (kéo để đổi thứ tự)',
          type: 'array',
          validation: (r) => r.required().min(1).max(12),
          of: [
            defineArrayMember({
              type: 'object',
              name: 'focusCard',
              fields: [req('title', 'Tên lĩnh vực'), req('description', 'Mô tả ngắn', 'text'), icon, defineField({ name: 'href', title: 'Đích', type: 'string', initialValue: '#resources', validation: (r) => r.required() })],
              preview: { select: { title: 'title', subtitle: 'description' } },
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'news',
      title: 'Khối tin tức',
      type: 'object',
      group: 'news',
      fields: [
        req('eyebrow', 'Nhãn'),
        req('title', 'Tiêu đề'),
        req('description', 'Mô tả', 'text'),
        cta('allLink', 'Liên kết "Xem tất cả"'),
        defineField({
          name: 'picks',
          title: '3 bài nổi bật (bài đầu là thẻ lớn)',
          type: 'array',
          validation: (r) => r.required().length(3),
          of: [
            defineArrayMember({
              type: 'object',
              name: 'newsPick',
              fields: [
                defineField({ name: 'article', title: 'Bài viết', type: 'reference', to: [{ type: 'article' }], validation: (r) => r.required() }),
                cta('link', 'Liên kết trong thẻ'),
              ],
              preview: { select: { title: 'article.title', subtitle: 'link.label' } },
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'membership',
      title: 'Hội viên',
      type: 'object',
      group: 'membership',
      fields: [
        req('eyebrow', 'Nhãn'),
        req('title', 'Tiêu đề', 'text'),
        req('description', 'Mô tả', 'text'),
        req('cta', 'Chữ nút mở biểu mẫu'),
        defineField({
          name: 'points',
          title: '3 điểm lợi ích',
          type: 'array',
          validation: (r) => r.required().length(3),
          of: [defineArrayMember({ type: 'object', name: 'point', fields: [req('title', 'Tiêu đề'), req('description', 'Mô tả', 'text')], preview: { select: { title: 'title', subtitle: 'description' } } })],
        }),
        req('signature', 'Câu viết tay phía dưới'),
      ],
    }),
    defineField({
      name: 'resources',
      title: 'Thư viện',
      type: 'object',
      group: 'resources',
      fields: [
        req('eyebrow', 'Nhãn'),
        defineField({ name: 'titleLines', title: 'Tiêu đề (mỗi dòng một mục)', type: 'array', of: [{ type: 'string' }], validation: (r) => r.required().min(1).max(2) }),
        req('description', 'Mô tả', 'text'),
        defineField({
          name: 'cards',
          title: '2 thẻ',
          type: 'array',
          validation: (r) => r.required().length(2),
          of: [
            defineArrayMember({
              type: 'object',
              name: 'resourceCard',
              fields: [req('kicker', 'Nhãn nhỏ (VD: 01 / THƯ VIỆN)'), req('title', 'Tiêu đề'), req('description', 'Mô tả', 'text'), icon, req('ariaLabel', 'Mô tả nút cho trình đọc màn hình'), defineField({ name: 'href', title: 'Đích', type: 'string', initialValue: '#contact', validation: (r) => r.required() })],
              preview: { select: { title: 'title', subtitle: 'kicker' } },
            }),
          ],
        }),
        req('band', 'Dải thông điệp dưới cùng', 'text'),
      ],
    }),
    defineField({ name: 'seo', title: 'SEO trang chủ', type: 'seo', group: 'seo' }),
  ],
  preview: { prepare: () => ({ title: 'Trang chủ' }) },
});
