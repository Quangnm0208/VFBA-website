import { defineArrayMember, defineField, defineType } from 'sanity';

/** Link with a visible label. `href` accepts an on-page anchor, a site path or an https URL. */
export const cta = defineType({
  name: 'cta',
  title: 'Liên kết',
  type: 'object',
  fields: [
    defineField({ name: 'label', title: 'Chữ hiển thị', type: 'string', validation: (r) => r.required().max(60) }),
    defineField({
      name: 'href',
      title: 'Đích',
      type: 'string',
      description: 'Ví dụ: #membership (mục trên trang chủ), /tin-tuc/ (trang trong website) hoặc https://…',
      validation: (r) => r.required().custom((v) => (!v || /^(#[\w-]+|\/[^\s]*|https:\/\/[^\s]+)$/.test(v) ? true : 'Dùng #mục, /đường-dẫn hoặc https://…')),
    }),
  ],
  preview: { select: { title: 'label', subtitle: 'href' } },
});

const alt = defineField({ name: 'alt', title: 'Văn bản thay thế (alt)', type: 'string', description: 'Mô tả ảnh cho người dùng đọc màn hình và công cụ tìm kiếm.', validation: (r) => r.required().max(180) });

/**
 * Article body. Deliberately limited to what the design has: normal text, H2, bullet list with a bold lead-in,
 * a figure and the "Điểm chính" callout. Editors cannot create styles that do not exist in the design.
 */
export const body = defineType({
  name: 'articleBody',
  title: 'Nội dung bài viết',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        { title: 'Đoạn văn', value: 'normal' },
        { title: 'Tiêu đề mục (H2)', value: 'h2' },
      ],
      lists: [{ title: 'Danh sách gạch đầu dòng', value: 'bullet' }],
      marks: {
        decorators: [
          { title: 'In đậm', value: 'strong' },
          { title: 'In nghiêng', value: 'em' },
        ],
        annotations: [
          {
            name: 'link',
            type: 'object',
            title: 'Liên kết',
            fields: [defineField({ name: 'href', type: 'url', title: 'URL', validation: (r) => r.uri({ scheme: ['https', 'mailto', 'tel'] }) })],
          },
        ],
      },
    }),
    defineArrayMember({
      type: 'object',
      name: 'figure',
      title: 'Hình ảnh',
      fields: [
        defineField({ name: 'image', title: 'Ảnh', type: 'image', options: { hotspot: true }, fields: [alt], validation: (r) => r.required() }),
        defineField({ name: 'caption', title: 'Chú thích', type: 'string' }),
      ],
      preview: { select: { title: 'caption', media: 'image' }, prepare: ({ title, media }) => ({ title: title || 'Hình ảnh', media }) },
    }),
    defineArrayMember({
      type: 'object',
      name: 'callout',
      title: 'Khối "Điểm chính"',
      fields: [
        defineField({ name: 'title', title: 'Nhãn', type: 'string', initialValue: 'ĐIỂM CHÍNH' }),
        defineField({ name: 'text', title: 'Nội dung', type: 'text', rows: 3, validation: (r) => r.required().max(500) }),
      ],
      preview: { select: { title: 'title', subtitle: 'text' } },
    }),
  ],
});

export const coverImage = (name = 'cover', title = 'Ảnh bìa') =>
  defineField({
    name,
    title,
    type: 'image',
    options: { hotspot: true },
    fields: [alt],
    // `required()` alone accepts an image object that has an alt text but no uploaded file: check the asset itself.
    validation: (r) => r.required().custom((value) => ((value as { asset?: { _ref?: string } } | undefined)?.asset?._ref ? true : 'Hãy tải lên ảnh bìa. Nếu để trống, website dùng ảnh mặc định của VBFA.')),
    description: 'Ảnh ngang, tối thiểu 1600px. Có hotspot để cắt đúng chủ thể ở thẻ 16:10 và ảnh bìa rộng.',
  });
