import { defineField, defineType } from 'sanity';

export const newsPage = defineType({
  name: 'newsPage',
  title: 'Trang Tin tức',
  type: 'document',
  fields: [
    defineField({ name: 'eyebrow', title: 'Nhãn nhỏ', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'line1', title: 'Tiêu đề · dòng 1', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'highlight', title: 'Tiêu đề · cụm nhấn màu (dòng 2)', type: 'string', validation: (r) => r.required() }),
    defineField({ name: 'lead', title: 'Đoạn mô tả', type: 'text', rows: 2, validation: (r) => r.required() }),
    defineField({ name: 'seo', title: 'SEO trang Tin tức', type: 'seo' }),
  ],
  preview: { prepare: () => ({ title: 'Trang Tin tức' }) },
});
