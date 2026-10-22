import {defineField,defineType} from 'sanity';

// All labels are written for Vietnamese content editors. Publishing a document
// is distinct from marking a piece of news as "approved" by the client.
const seoFields=[
  defineField({name:'seoTitle',title:'Tiêu đề SEO',type:'string',description:'Không bắt buộc. Nếu bỏ trống, dùng tiêu đề bài/trang.',validation:Rule=>Rule.max(70)}),
  defineField({name:'seoDescription',title:'Mô tả SEO',type:'text',rows:3,validation:Rule=>Rule.max(170)}),
];

const articleCover=defineField({
  name:'cover',title:'Ảnh đại diện bài viết',type:'image',
  options:{hotspot:true},
  fields:[defineField({name:'alt',title:'Văn bản thay thế (Alt)',type:'string',validation:Rule=>Rule.required().max(180)})],
});

export const schemaTypes=[
  defineType({
    name:'siteSettings',title:'Thông tin hiệp hội',type:'document',
    groups:[{name:'identity',title:'Nhận diện',default:true},{name:'contact',title:'Liên hệ'},{name:'seo',title:'SEO'}],
    fields:[
      defineField({name:'organizationName',title:'Tên tiếng Việt',type:'string',group:'identity',validation:Rule=>Rule.required()}),
      defineField({name:'organizationEnglish',title:'Tên tiếng Anh',type:'string',group:'identity'}),
      defineField({name:'logo',title:'Logo chính thức',type:'image',group:'identity',description:'Chỉ tải logo VBFA đã được chấp thuận sử dụng.'}),
      defineField({name:'email',title:'Email liên hệ',type:'string',group:'contact',validation:Rule=>Rule.email()}),
      defineField({name:'phone',title:'Điện thoại liên hệ',type:'string',group:'contact'}),
      defineField({name:'address',title:'Địa chỉ trụ sở',type:'text',rows:2,group:'contact'}),
      defineField({name:'websiteUrl',title:'Website chính thức',type:'url',group:'contact'}),
      ...seoFields.map(field=>({...field,group:'seo' as const})),
    ],
    preview:{select:{title:'organizationName',subtitle:'organizationEnglish',media:'logo'}},
  }),
  defineType({
    name:'homePage',title:'Trang chủ',type:'document',
    groups:[{name:'hero',title:'Hero',default:true},{name:'about',title:'Giới thiệu'},{name:'sections',title:'Các section'},{name:'seo',title:'SEO'}],
    fields:[
      defineField({name:'eyebrow',title:'Nhãn Hero',type:'string',group:'hero'}),
      defineField({name:'headline',title:'Tiêu đề Hero',type:'string',group:'hero',validation:Rule=>Rule.required().max(145)}),
      defineField({name:'subheadline',title:'Mô tả Hero',type:'text',rows:3,group:'hero',validation:Rule=>Rule.max(400)}),
      defineField({name:'heroImage',title:'Ảnh chính Hero',type:'image',group:'hero',description:'Ảnh ngang khuyến nghị 1600×1100 trở lên, có crop/hotspot.',options:{hotspot:true},fields:[defineField({name:'alt',title:'Alt text',type:'string',validation:Rule=>Rule.required().max(180)})]}),
      defineField({name:'primaryCta',title:'Nhãn CTA Hero',type:'string',group:'hero'}),
      defineField({name:'aboutTitle',title:'Tiêu đề giới thiệu',type:'string',group:'about',validation:Rule=>Rule.required()}),
      defineField({name:'aboutDescription',title:'Nội dung giới thiệu',type:'text',rows:5,group:'about'}),
      defineField({name:'focusTitle',title:'Tiêu đề lĩnh vực trọng tâm',type:'string',group:'sections'}),
      defineField({name:'focusDescription',title:'Mô tả lĩnh vực trọng tâm',type:'text',rows:3,group:'sections'}),
      defineField({name:'newsTitle',title:'Tiêu đề tin tức',type:'string',group:'sections'}),
      defineField({name:'newsDescription',title:'Mô tả tin tức',type:'text',rows:3,group:'sections'}),
      defineField({name:'membershipTitle',title:'Tiêu đề hội viên',type:'string',group:'sections'}),
      defineField({name:'membershipDescription',title:'Mô tả hội viên',type:'text',rows:3,group:'sections'}),
      defineField({name:'resourcesTitle',title:'Tiêu đề thư viện',type:'string',group:'sections'}),
      defineField({name:'resourcesDescription',title:'Mô tả thư viện',type:'text',rows:3,group:'sections'}),
      defineField({name:'contactTitle',title:'Tiêu đề liên hệ',type:'string',group:'sections'}),
      defineField({name:'contactDescription',title:'Mô tả liên hệ',type:'text',rows:3,group:'sections'}),
      ...seoFields.map(field=>({...field,group:'seo' as const})),
    ],
    preview:{select:{title:'headline',media:'heroImage'}},
  }),
  defineType({
    name:'focusArea',title:'Lĩnh vực trọng tâm',type:'document',
    fields:[
      defineField({name:'title',title:'Tên lĩnh vực',type:'string',validation:Rule=>Rule.required().max(100)}),
      defineField({name:'description',title:'Mô tả ngắn',type:'text',rows:4,validation:Rule=>Rule.required().max(360)}),
      defineField({name:'number',title:'Thứ tự hiển thị (1–99)',type:'number',initialValue:1,validation:Rule=>Rule.required().integer().min(1).max(99)}),
      defineField({name:'icon',title:'Mã biểu tượng (nếu cần)',type:'string',description:'Có thể để trống để website dùng biểu tượng mặc định.'}),
    ],
    preview:{select:{title:'title',number:'number'},prepare({title,number}){return {title,subtitle:'Thứ tự: '+(number??'—')}}},
    orderings:[{title:'Thứ tự hiển thị',name:'numberAsc',by:[{field:'number',direction:'asc'}]}],
  }),
  defineType({
    name:'article',title:'Tin tức & góc nhìn',type:'document',
    groups:[{name:'content',title:'Nội dung',default:true},{name:'publishing',title:'Xuất bản'},{name:'seo',title:'SEO'}],
    fields:[
      defineField({name:'title',title:'Tiêu đề bài viết',type:'string',group:'content',validation:Rule=>Rule.required().min(8).max(180)}),
      defineField({name:'slug',title:'Đường dẫn bài viết',type:'slug',group:'content',options:{source:'title',maxLength:96},validation:Rule=>Rule.required()}),
      defineField({name:'excerpt',title:'Mô tả ngắn trên danh sách',type:'text',group:'content',rows:3,validation:Rule=>Rule.required().min(25).max(380)}),
      defineField({name:'cover',title:'Ảnh nổi bật',type:'image',group:'content',options:{hotspot:true},fields:[defineField({name:'alt',title:'Alt text',type:'string',validation:Rule=>Rule.required().max(180)})]}),
      defineField({name:'body',title:'Nội dung chi tiết',type:'array',group:'content',of:[{type:'block',styles:[{title:'Đoạn văn',value:'normal'},{title:'Tiêu đề H2',value:'h2'},{title:'Tiêu đề H3',value:'h3'},{title:'Trích dẫn',value:'blockquote'}]},{type:'image',options:{hotspot:true},fields:[{name:'alt',title:'Alt text',type:'string',validation:Rule=>Rule.required()}]}]],validation:Rule=>Rule.required().min(1)}),
      defineField({name:'category',title:'Chuyên mục',type:'string',group:'publishing',options:{list:[{title:'Tin ngành',value:'Tin ngành'},{title:'Hoạt động',value:'Hoạt động'},{title:'Chính sách',value:'Chính sách'},{title:'Góc nhìn',value:'Góc nhìn'}]},validation:Rule=>Rule.required()}),
      defineField({name:'publishedAt',title:'Ngày hiển thị',type:'datetime',group:'publishing',initialValue:()=>new Date().toISOString(),description:'Bài chỉ xuất hiện trên website sau khi được Publish và đến ngày hiển thị.',validation:Rule=>Rule.required()}),
      defineField({name:'sourceUrl',title:'Nguồn tham khảo (nếu có)',type:'url',group:'publishing'}),
      defineField({name:'internalReviewNote',title:'Ghi chú biên tập nội bộ',type:'text',group:'publishing',rows:3,description:'Không hiển thị trên website.'}),
      ...seoFields.map(field=>({...field,group:'seo' as const})),
    ],
    preview:{select:{title:'title',subtitle:'category',media:'cover'}},
    orderings:[{title:'Mới nhất',name:'publishedDateDesc',by:[{field:'publishedAt',direction:'desc'}]}],
  }),
  defineType({
    name:'resource',title:'Thư viện tài liệu',type:'document',
    fields:[
      defineField({name:'title',title:'Tên tài liệu',type:'string',validation:Rule=>Rule.required().max(180)}),
      defineField({name:'category',title:'Nhóm tài liệu',type:'string',options:{list:['Tài liệu & báo cáo','Chính sách & pháp lý','Tài liệu hội viên','Tham khảo']},validation:Rule=>Rule.required()}),
      defineField({name:'description',title:'Giới thiệu tài liệu',type:'text',rows:3,validation:Rule=>Rule.max(400)}),
      defineField({name:'file',title:'File PDF hoặc tài liệu',type:'file',description:'Tải file công khai; không đưa tài liệu nội bộ/nhạy cảm vào dataset public.',validation:Rule=>Rule.custom((value,context)=>value||(context.document as {externalUrl?:string}|undefined)?.externalUrl?true:'Cần có file hoặc đường dẫn chính thức.')}),
      defineField({name:'externalUrl',title:'Đường dẫn chính thức thay cho file',type:'url'}),
      defineField({name:'publishedAt',title:'Ngày phát hành',type:'date'}),
      ...seoFields,
    ],
    preview:{select:{title:'title',subtitle:'category'}},
  }),
  defineType({
    name:'event',title:'Hoạt động & sự kiện',type:'document',
    fields:[
      defineField({name:'title',title:'Tên hoạt động/sự kiện',type:'string',validation:Rule=>Rule.required().max(180)}),
      defineField({name:'summary',title:'Mô tả ngắn',type:'text',rows:3,validation:Rule=>Rule.required()}),
      defineField({name:'startsAt',title:'Thời gian bắt đầu',type:'datetime',validation:Rule=>Rule.required()}),
      articleCover,
      defineField({name:'body',title:'Thông tin chi tiết',type:'array',of:[{type:'block'}]}),
      ...seoFields,
    ],
    preview:{select:{title:'title',subtitle:'startsAt',media:'cover'}},
  }),
  defineType({
    name:'partner',title:'Đối tác đã xác minh',type:'document',
    fields:[
      defineField({name:'name',title:'Tên tổ chức/doanh nghiệp',type:'string',validation:Rule=>Rule.required()}),
      defineField({name:'logo',title:'Logo được phép sử dụng',type:'image'}),
      defineField({name:'website',title:'Website chính thức',type:'url'}),
      defineField({name:'verified',title:'Đã được duyệt công khai',type:'boolean',initialValue:false,description:'Chỉ công bố sau khi có bằng chứng hợp tác và quyền sử dụng logo.'}),
      defineField({name:'internalNote',title:'Ghi chú nội bộ',type:'text',rows:3}),
    ],
    preview:{select:{title:'name',media:'logo',verified:'verified'},prepare({title,media,verified}){return {title,media,subtitle:verified?'Đã xác minh':'Chưa xác minh – không công bố'}}},
  }),
];
