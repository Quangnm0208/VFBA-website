import {defineField,defineType} from 'sanity';
const seo=[
 defineField({name:'seoTitle',title:'SEO title',type:'string'}),
 defineField({name:'seoDescription',title:'SEO description',type:'text',rows:3})
];
const image=defineField({name:'cover',title:'Ảnh đại diện',type:'image',options:{hotspot:true},fields:[defineField({name:'alt',title:'Mô tả ảnh (alt)',type:'string'})]});
export const schemaTypes=[
 defineType({name:'siteSettings',title:'01 · Thông tin hiệp hội',type:'document',fields:[
  defineField({name:'organizationName',title:'Tên hiệp hội',type:'string',validation:r=>r.required()}),
  defineField({name:'organizationEnglish',title:'Tên tiếng Anh',type:'string'}),
  defineField({name:'logo',title:'Logo chính thức',type:'image',options:{hotspot:false}}),
  defineField({name:'email',title:'Email liên hệ (được duyệt)',type:'string'}),
  defineField({name:'phone',title:'Điện thoại (được duyệt)',type:'string'}),
  defineField({name:'address',title:'Địa chỉ (được duyệt)',type:'text',rows:2}),
  ...seo
 ]}),
 defineType({name:'homePage',title:'02 · Trang chủ',type:'document',fields:[
  defineField({name:'eyebrow',title:'Nhãn Hero',type:'string'}),
  defineField({name:'headline',title:'Headline',type:'string',validation:r=>r.required()}),
  defineField({name:'subheadline',title:'Mô tả Hero',type:'text',rows:3}),
  defineField({name:'heroImage',title:'Hình Hero',type:'image',options:{hotspot:true}}),
  defineField({name:'aboutTitle',title:'Tiêu đề giới thiệu',type:'string'}),
  defineField({name:'aboutDescription',title:'Mô tả giới thiệu',type:'text',rows:5}),
  defineField({name:'primaryCta',title:'Nút CTA',type:'string'}),
  ...seo
 ]}),
 defineType({name:'focusArea',title:'03 · Lĩnh vực trọng tâm',type:'document',fields:[
  defineField({name:'title',title:'Tên lĩnh vực',type:'string',validation:r=>r.required()}),
  defineField({name:'description',title:'Mô tả',type:'text',rows:3}),
  defineField({name:'number',title:'Vị trí sắp xếp',type:'number',initialValue:1}),
  defineField({name:'icon',title:'Tên biểu tượng (tuỳ chọn)',type:'string'})
 ]}),
 defineType({name:'article',title:'04 · Tin tức / Góc nhìn',type:'document',fields:[
  defineField({name:'title',title:'Tiêu đề',type:'string',validation:r=>r.required()}),
  defineField({name:'slug',title:'Đường dẫn',type:'slug',options:{source:'title',maxLength:96},validation:r=>r.required()}),
  defineField({name:'excerpt',title:'Tóm tắt',type:'text',rows:3}),
  defineField({name:'category',title:'Chuyên mục',type:'string',options:{list:['Tin ngành','Hoạt động','Chính sách','Góc nhìn']}}),
  image,
  defineField({name:'publishedAt',title:'Ngày xuất bản',type:'datetime'}),
  defineField({name:'body',title:'Nội dung',type:'array',of:[{type:'block'},{type:'image',options:{hotspot:true}}]}),
  ...seo
 ],preview:{select:{title:'title',subtitle:'category',media:'cover'}}}),
 defineType({name:'resource',title:'05 · Thư viện tài liệu',type:'document',fields:[
  defineField({name:'title',title:'Tên tài liệu',type:'string',validation:r=>r.required()}),
  defineField({name:'category',title:'Nhóm tài liệu',type:'string',options:{list:['Tài liệu & báo cáo','Chính sách & pháp lý','Tài liệu hội viên','Tham khảo']}}),
  defineField({name:'description',title:'Tóm tắt',type:'text',rows:3}),
  defineField({name:'file',title:'PDF hoặc tài liệu tải xuống',type:'file'}),
  defineField({name:'externalUrl',title:'URL nguồn chính thức (nếu không tải file)',type:'url'}),
  ...seo
 ]}),
 defineType({name:'event',title:'06 · Hoạt động & sự kiện',type:'document',fields:[
  defineField({name:'title',title:'Tên hoạt động',type:'string',validation:r=>r.required()}),
  defineField({name:'summary',title:'Mô tả ngắn',type:'text',rows:4}),
  defineField({name:'startsAt',title:'Thời gian',type:'datetime'}),
  image,
  defineField({name:'body',title:'Chi tiết',type:'array',of:[{type:'block'}]})
 ]}),
 defineType({name:'partner',title:'07 · Đối tác (chỉ đã xác minh)',type:'document',fields:[
  defineField({name:'name',title:'Tên doanh nghiệp/tổ chức',type:'string',validation:r=>r.required()}),
  defineField({name:'logo',title:'Logo có quyền sử dụng',type:'image'}),
  defineField({name:'website',title:'Website chính thức',type:'url'}),
  defineField({name:'verified',title:'Đã được xác minh và duyệt công khai',type:'boolean',initialValue:false})
 ]})
];