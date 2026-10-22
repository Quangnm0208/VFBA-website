import { defineField, defineType } from 'sanity';
import { coverImage } from './objects';

const CATEGORIES = [
  { title: 'Tin ngành', value: 'news' },
  { title: 'Hoạt động', value: 'activity' },
  { title: 'Chính sách', value: 'policy' },
];

export const article = defineType({
  name: 'article',
  title: 'Tin tức & góc nhìn',
  type: 'document',
  groups: [
    { name: 'content', title: 'Nội dung', default: true },
    { name: 'publishing', title: 'Xuất bản' },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    defineField({ name: 'title', title: 'Tiêu đề', type: 'string', group: 'content', validation: (r) => r.required().min(8).max(160) }),
    defineField({ name: 'slug', title: 'Đường dẫn (URL)', type: 'slug', group: 'content', options: { source: 'title', maxLength: 90, slugify: (input: string) => input.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) }, description: 'Chữ thường không dấu, ngăn cách bằng dấu gạch ngang. Đổi sau khi đã xuất bản sẽ làm hỏng liên kết cũ.', validation: (r) => r.required().custom((v) => (!v?.current || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v.current) ? true : 'Chỉ dùng chữ thường không dấu, số và dấu gạch ngang (ví dụ: dong-luc-tuong-lai).')) }),
    defineField({ name: 'excerpt', title: 'Tóm tắt', type: 'text', rows: 3, group: 'content', description: 'Hiện trên thẻ danh sách, đầu bài viết và khi chia sẻ.', validation: (r) => r.required().min(30).max(320) }),
    { ...coverImage(), group: 'content' },
    defineField({ name: 'body', title: 'Nội dung', type: 'articleBody', group: 'content', validation: (r) => r.required().min(1) }),

    defineField({ name: 'category', title: 'Chuyên mục', type: 'string', group: 'publishing', options: { list: CATEGORIES, layout: 'radio' }, validation: (r) => r.required() }),
    defineField({ name: 'kicker', title: 'Nhãn phụ (chữ in hoa)', type: 'string', group: 'publishing', description: 'Ví dụ: TIN NGÀNH · GÓC NHÌN', validation: (r) => r.required().max(60) }),
    defineField({ name: 'publishedAt', title: 'Ngày hiển thị', type: 'datetime', group: 'publishing', initialValue: () => new Date().toISOString(), description: 'Bài chỉ xuất hiện trên website khi đã Publish và đã đến ngày này. Website cập nhật sau mỗi lần Publish (tự động build lại).', validation: (r) => r.required() }),
    defineField({ name: 'readingMinutes', title: 'Thời gian đọc (phút)', type: 'number', group: 'publishing', description: 'Bỏ trống để tự tính theo số từ.', validation: (r) => r.integer().min(1).max(60) }),

    defineField({ name: 'seo', title: 'SEO', type: 'seo', group: 'seo' }),
  ],
  orderings: [{ title: 'Mới nhất', name: 'publishedDesc', by: [{ field: 'publishedAt', direction: 'desc' }] }],
  preview: {
    select: { title: 'title', category: 'category', date: 'publishedAt', media: 'cover' },
    prepare: ({ title, category, date, media }) => ({ title, media, subtitle: `${CATEGORIES.find((c) => c.value === category)?.title ?? '—'} · ${date ? new Date(date).toLocaleDateString('vi-VN') : 'chưa đặt ngày'}` }),
  },
});
