import { defineField, defineType } from 'sanity';

/**
 * Pop-up campaigns. The website is static, so the browser decides when to show one: schedule window,
 * frequency cap (per visitor, per revision), trigger and the "never interrupt" rules live in src/scripts/popup.ts.
 */
export const popup = defineType({
  name: 'popup',
  title: 'Pop-up',
  type: 'document',
  groups: [
    { name: 'content', title: 'Nội dung', default: true },
    { name: 'rules', title: 'Khi nào hiện' },
  ],
  fields: [
    defineField({ name: 'enabled', title: 'Đang bật', type: 'boolean', initialValue: true, group: 'rules', description: 'Tắt để ngừng hiển thị mà không cần xóa.' }),
    defineField({ name: 'heading', title: 'Tiêu đề', type: 'string', group: 'content', validation: (r) => r.required().max(90) }),
    defineField({ name: 'body', title: 'Nội dung ngắn', type: 'text', rows: 3, group: 'content', validation: (r) => r.max(400) }),
    defineField({ name: 'image', title: 'Ảnh (không bắt buộc)', type: 'image', options: { hotspot: true }, group: 'content', fields: [defineField({ name: 'alt', title: 'Văn bản thay thế (alt)', type: 'string', validation: (r) => r.required() })] }),
    defineField({ name: 'ctaAction', title: 'Nút chính làm gì', type: 'string', group: 'content', initialValue: 'none', options: { list: [{ title: 'Không có nút', value: 'none' }, { title: 'Mở biểu mẫu kết nối hội viên', value: 'join' }, { title: 'Đi tới một liên kết', value: 'link' }], layout: 'radio' } }),
    defineField({ name: 'ctaLabel', title: 'Chữ nút chính', type: 'string', group: 'content', hidden: ({ document }) => document?.ctaAction === 'none', validation: (r) => r.max(40).custom((v, ctx) => (ctx.document?.ctaAction !== 'none' && !v ? 'Cần chữ cho nút.' : true)) }),
    defineField({ name: 'ctaUrl', title: 'Liên kết của nút', type: 'string', group: 'content', hidden: ({ document }) => document?.ctaAction !== 'link', description: '#mục, /đường-dẫn hoặc https://…', validation: (r) => r.custom((v, ctx) => (ctx.document?.ctaAction === 'link' && !(v && /^(#[\w-]+|\/[^\s]*|https:\/\/[^\s]+)$/.test(v)) ? 'Nhập #mục, /đường-dẫn hoặc https://…' : true)) }),
    defineField({ name: 'dismissLabel', title: 'Chữ nút đóng', type: 'string', group: 'content', initialValue: 'Để sau' }),

    defineField({ name: 'pages', title: 'Hiện ở trang nào', type: 'array', group: 'rules', of: [{ type: 'string' }], initialValue: ['home'], options: { list: [{ title: 'Trang chủ', value: 'home' }, { title: 'Trang Tin tức', value: 'news' }, { title: 'Bài viết', value: 'article' }, { title: 'Trang tĩnh', value: 'page' }], layout: 'grid' }, validation: (r) => r.required().min(1) }),
    defineField({ name: 'trigger', title: 'Điều kiện kích hoạt', type: 'string', group: 'rules', initialValue: 'delay', options: { list: [{ title: 'Sau một khoảng thời gian', value: 'delay' }, { title: 'Khi cuộn tới một mức', value: 'scroll' }, { title: 'Khi định rời trang (máy tính)', value: 'exit' }], layout: 'radio' } }),
    defineField({ name: 'delaySeconds', title: 'Số giây chờ', type: 'number', group: 'rules', initialValue: 10, hidden: ({ document }) => document?.trigger !== 'delay', validation: (r) => r.integer().min(3).max(120) }),
    defineField({ name: 'scrollPercent', title: '% trang đã cuộn', type: 'number', group: 'rules', initialValue: 50, hidden: ({ document }) => document?.trigger !== 'scroll', validation: (r) => r.integer().min(10).max(90) }),
    defineField({ name: 'frequency', title: 'Tần suất với mỗi khách', type: 'string', group: 'rules', initialValue: 'weekly', options: { list: [{ title: 'Mỗi phiên truy cập', value: 'session' }, { title: 'Tối đa 1 lần / ngày', value: 'daily' }, { title: 'Tối đa 1 lần / tuần', value: 'weekly' }, { title: 'Chỉ 1 lần', value: 'once' }], layout: 'radio' }, description: 'Khi bạn sửa và Publish lại, khách đã đóng pop-up sẽ thấy bản mới.' }),
    defineField({ name: 'startsAt', title: 'Bắt đầu', type: 'datetime', group: 'rules' }),
    defineField({ name: 'endsAt', title: 'Kết thúc', type: 'datetime', group: 'rules', validation: (r) => r.custom((v, ctx) => (v && ctx.document?.startsAt && new Date(v) <= new Date(ctx.document.startsAt as string) ? 'Ngày kết thúc phải sau ngày bắt đầu.' : true)) }),
    defineField({ name: 'priority', title: 'Độ ưu tiên', type: 'number', group: 'rules', initialValue: 0, description: 'Mỗi lượt xem trang chỉ hiện một pop-up: số lớn hơn được ưu tiên.', validation: (r) => r.integer() }),
  ],
  preview: {
    select: { title: 'heading', enabled: 'enabled', trigger: 'trigger', media: 'image' },
    prepare: ({ title, enabled, trigger, media }) => ({ title, media, subtitle: `${enabled ? 'Đang bật' : 'Tắt'} · ${({ delay: 'theo thời gian', scroll: 'khi cuộn', exit: 'khi rời trang' } as Record<string, string>)[trigger] ?? ''}` }),
  },
});
