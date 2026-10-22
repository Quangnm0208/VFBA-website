import { defineField, defineType } from 'sanity';

/** Reused by article, page, home, news page and site settings. Empty fields fall back to the page's own title/excerpt. */
export const seo = defineType({
  name: 'seo',
  title: 'SEO',
  type: 'object',
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({ name: 'title', title: 'Tiêu đề SEO', type: 'string', description: 'Hiện trên Google và khi chia sẻ. Bỏ trống để dùng tiêu đề trang. Nên ≤ 60 ký tự.', validation: (r) => r.max(70).warning('Tiêu đề dài hơn 70 ký tự có thể bị cắt.') }),
    defineField({ name: 'description', title: 'Mô tả SEO', type: 'text', rows: 3, description: 'Bỏ trống để dùng tóm tắt của trang. Nên 120–160 ký tự.', validation: (r) => r.max(200).warning('Mô tả quá dài có thể bị cắt.') }),
    defineField({ name: 'canonicalUrl', title: 'Canonical URL', type: 'url', description: 'Chỉ điền khi nội dung này là bản sao của một trang khác.', validation: (r) => r.uri({ scheme: ['https'] }) }),
    defineField({
      name: 'ogImage',
      title: 'Ảnh chia sẻ (Open Graph)',
      type: 'image',
      options: { hotspot: true },
      description: 'Khuyến nghị 1200×630. Bỏ trống để dùng ảnh bìa hoặc ảnh mặc định của website.',
      fields: [defineField({ name: 'alt', title: 'Văn bản thay thế (alt)', type: 'string' })],
    }),
    defineField({ name: 'noIndex', title: 'Ẩn khỏi công cụ tìm kiếm (noindex)', type: 'boolean', initialValue: false, description: 'Trang vẫn truy cập được bằng đường dẫn nhưng không xuất hiện trên Google và sitemap.' }),
  ],
});
