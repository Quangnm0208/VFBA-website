import { defineField, defineType } from 'sanity';

/** Static content pages such as the privacy policy or terms. Routed at /<slug>/. */
export const page = defineType({
  name: 'page',
  title: 'Trang tĩnh',
  type: 'document',
  fields: [
    defineField({ name: 'title', title: 'Tiêu đề', type: 'string', validation: (r) => r.required().max(120) }),
    defineField({
      name: 'slug',
      title: 'Đường dẫn (URL)',
      type: 'slug',
      options: { source: 'title', maxLength: 80 },
      description: 'Ví dụ: chinh-sach-bao-mat → /chinh-sach-bao-mat/. Không dùng trùng với các đường dẫn có sẵn (tin-tuc, api).',
      validation: (r) =>
        r.required().custom((v) => {
          if (!v?.current) return true;
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.current)) return 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang.';
          return ['tin-tuc', 'api', 'search-index', 'sitemap', 'robots'].includes(v.current) ? 'Đường dẫn này đã được website sử dụng.' : true;
        }),
    }),
    defineField({ name: 'intro', title: 'Đoạn dẫn', type: 'text', rows: 3, validation: (r) => r.max(400) }),
    defineField({ name: 'body', title: 'Nội dung', type: 'articleBody', validation: (r) => r.required().min(1) }),
    defineField({ name: 'seo', title: 'SEO', type: 'seo' }),
  ],
  preview: { select: { title: 'title', subtitle: 'slug.current' } },
});
