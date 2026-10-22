import type { HomeContent } from '../schema';

export const homeSeed: HomeContent = {
  hero: {
    eyebrow: 'Vietnam Biofuels Association',
    line1: 'Kết nối nguồn lực.',
    line2Prefix: 'Kiến tạo tương lai',
    highlight: 'năng lượng xanh.',
    lead: 'Không gian kết nối doanh nghiệp, chuyên gia và đối tác; chia sẻ thông tin, tri thức và cơ hội hợp tác trong hệ sinh thái nhiên liệu sinh học Việt Nam.',
    primaryCta: { label: 'Khám phá VBFA', href: '#about' },
    secondaryCta: { label: 'Các lĩnh vực trọng tâm', href: '#focus' },
    microLabel: 'Energy · Collaboration · Sustainability',
    stripLabel: 'KẾT NỐI',
    stripScript: 'vì tương lai bền vững',
    stripPoints: ['Kết nối doanh nghiệp', 'Trao đổi chính sách', 'Chia sẻ tri thức'],
    stripCue: 'KHÁM PHÁ BÊN DƯỚI',
  },
  about: {
    eyebrow: 'Về hiệp hội',
    title: 'Nơi hội tụ những tiếng nói vì một ngành nhiên liệu sinh học phát triển bền vững.',
    link: { label: 'Tìm hiểu về mạng lưới hội viên', href: '#membership' },
    lead: 'Nơi hội tụ những trao đổi về nhiên liệu sinh học tại Việt Nam — từ chính sách, công nghệ đến thị trường và hợp tác. VBFA hướng đến việc kết nối cộng đồng và làm cho tri thức ngành trở nên dễ tiếp cận hơn.',
    rows: [
      { label: 'Kết nối hệ sinh thái và các bên liên quan', href: '#membership' },
      { label: 'Cập nhật thông tin ngành và chính sách', href: '/tin-tuc/' },
      { label: 'Thúc đẩy trao đổi tri thức và hợp tác', href: '#resources' },
    ],
  },
  focus: {
    eyebrow: 'Lĩnh vực trọng tâm',
    title: 'Những lĩnh vực tạo nên chuyển động ngành.',
    description: 'Từ chính sách, thị trường đến công nghệ và phát triển bền vững — những góc nhìn góp phần kết nối hệ sinh thái nhiên liệu sinh học.',
    kickerPrefix: 'CHỦ ĐỀ',
    cards: [
      { title: 'Chính sách & pháp lý', description: 'Cập nhật định hướng, văn bản và những thông tin liên quan đến hoạt động của ngành.', icon: 'scales', href: '#resources' },
      { title: 'Thị trường & đầu tư', description: 'Góc nhìn và nguồn tham khảo về thị trường, chuỗi giá trị và cơ hội phát triển.', icon: 'chart', href: '#resources' },
      { title: 'Công nghệ & đổi mới', description: 'Thông tin về giải pháp, công nghệ và thực tiễn triển khai nhiên liệu sinh học.', icon: 'flask', href: '#resources' },
      { title: 'Phát triển bền vững', description: 'Trao đổi về hiệu quả môi trường, chuyển dịch năng lượng và các tiêu chí ESG.', icon: 'sprout', href: '#resources' },
      { title: 'Đào tạo & tri thức', description: 'Chia sẻ tài liệu, tọa đàm và nguồn kiến thức có giá trị đối với cộng đồng.', icon: 'book', href: '#resources' },
      { title: 'Hợp tác quốc tế', description: 'Kết nối đối tác, chia sẻ kinh nghiệm và mở rộng các cơ hội hợp tác.', icon: 'globe', href: '#resources' },
    ],
  },
  news: {
    eyebrow: 'Tin tức & góc nhìn',
    title: 'Chuyển động ngành, góc nhìn mới.',
    description: 'Khám phá các thông tin, hoạt động và chủ đề nổi bật của ngành.',
    allLink: { label: 'Xem tất cả tin tức', href: '/tin-tuc/' },
    picks: [
      { slug: 'dong-luc-tuong-lai', link: { label: 'Xem danh mục thông tin', href: '/tin-tuc/' } },
      { slug: 'khong-gian-doi-thoai', link: { label: 'Tìm hiểu hợp tác', href: '#membership' } },
      { slug: 'tong-hop-chinh-sach', link: { label: 'Xem thư viện', href: '#resources' } },
    ],
  },
  membership: {
    eyebrow: 'Kết nối cùng VBFA',
    title: 'Cùng xây dựng một mạng lưới hợp tác có giá trị dài hạn.',
    description: 'Kết nối với VBFA để trao đổi thông tin, chia sẻ chuyên môn và tìm hiểu các cơ hội hợp tác trong cộng đồng nhiên liệu sinh học.',
    cta: 'Đăng ký quan tâm hội viên',
    points: [
      { title: 'Tiếp cận cộng đồng ngành', description: 'Tạo cơ hội trao đổi và tăng cường kết nối giữa các bên liên quan.' },
      { title: 'Cập nhật thông tin có hệ thống', description: 'Khám phá các chủ đề, hoạt động và nguồn tài liệu liên quan.' },
      { title: 'Khám phá cơ hội hợp tác', description: 'Mở rộng đối thoại và tìm kiếm giá trị cùng phát triển.' },
    ],
    signature: 'Kết nối hôm nay để bắt đầu những trao đổi có giá trị.',
  },
  resources: {
    eyebrow: 'Trung tâm thông tin',
    titleLines: ['Tri thức dễ tiếp cận.', 'Nội dung dễ tra cứu.'],
    description: 'Khám phá tài liệu, báo cáo và những nguồn thông tin được tổ chức theo chủ đề, giúp việc tìm hiểu ngành thuận tiện hơn.',
    cards: [
      { kicker: '01 / THƯ VIỆN', title: 'Tài liệu & báo cáo', description: 'Điểm truy cập tài liệu và nghiên cứu được phép công bố.', icon: 'document', ariaLabel: 'Liên hệ về tài liệu', href: '#contact' },
      { kicker: '02 / CHÍNH SÁCH', title: 'Văn bản & thông tin ngành', description: 'Tập hợp và phân loại nội dung theo chủ đề, thời gian.', icon: 'scales', ariaLabel: 'Liên hệ về chính sách', href: '#contact' },
    ],
    band: 'Cùng mở rộng khả năng tiếp cận thông tin và tri thức về nhiên liệu sinh học.',
  },
  seo: { noIndex: false },
};
