import industry from '../../../assets/seed/industry.webp';
import community from '../../../assets/seed/community.webp';
import knowledge from '../../../assets/seed/knowledge.webp';
import analytics from '../../../assets/seed/analytics.webp';
import plant from '../../../assets/seed/plant.webp';
import feedstock from '../../../assets/seed/feedstock.webp';
import networking from '../../../assets/seed/networking.webp';
import logistics from '../../../assets/seed/logistics.webp';
import { localMedia } from '../media';
import type { Article, Category, Media, PortableBody } from '../schema';

/**
 * Sample editorial content from the design handoff (reference/articles.sample.json).
 * Titles 4–10, dates, reading times and the shared body are placeholders to be replaced in Sanity.
 * The illustrations are generated and do not document a specific VBFA event or policy.
 */
const ART: Record<string, Media> = {
  industry: localMedia(industry, 'Minh họa nhà máy sản xuất nhiên liệu sinh học và cánh đồng nguyên liệu'),
  community: localMedia(community, 'Minh họa hoạt động kết nối doanh nghiệp trong lĩnh vực năng lượng bền vững'),
  knowledge: localMedia(knowledge, 'Minh họa nghiên cứu, báo cáo và tài liệu về chính sách năng lượng'),
  analytics: localMedia(analytics, 'Minh họa chuyên gia theo dõi dữ liệu thị trường và chính sách năng lượng trên màn hình phân tích'),
  plant: localMedia(plant, 'Minh họa tổ hợp nhà máy nhiên liệu sinh học bên sông và vùng nguyên liệu lúc bình minh'),
  feedstock: localMedia(feedstock, 'Minh họa thu gom rơm rạ và phụ phẩm nông nghiệp làm nguyên liệu sinh học trên đồng ruộng'),
  networking: localMedia(networking, 'Minh họa chuyên gia và doanh nghiệp trao đổi tại sự kiện kết nối ngành năng lượng xanh'),
  logistics: localMedia(logistics, 'Minh họa xe bồn vận chuyển nhiên liệu sinh học tại cơ sở sản xuất'),
};

const span = (text: string, marks: string[] = []) => ({ _type: 'span' as const, text, marks });
const p = (text: string) => ({ _type: 'block' as const, style: 'normal' as const, children: [span(text)], markDefs: [] });
const h2 = (text: string) => ({ _type: 'block' as const, style: 'h2' as const, children: [span(text)], markDefs: [] });
const bullet = (lead: string, text: string) => ({
  _type: 'block' as const,
  style: 'normal' as const,
  listItem: 'bullet' as const,
  children: [span(lead, ['strong']), span(` ${text}`)],
  markDefs: [],
});

const sampleBody = (figure: Media): PortableBody => [
  h2('Bối cảnh'),
  p('Nhiên liệu sinh học là nhóm nhiên liệu được sản xuất từ nguồn nguyên liệu sinh học như cây trồng, dầu mỡ đã qua sử dụng hoặc phụ phẩm nông nghiệp. Tại Việt Nam, chủ đề này gắn với nhiều lĩnh vực: chính sách, thị trường, công nghệ và phát triển bền vững.'),
  p('VBFA hướng đến việc kết nối cộng đồng và làm cho tri thức ngành trở nên dễ tiếp cận hơn.'),
  { _type: 'figure', media: figure, caption: 'Chú thích hình ảnh.' },
  h2('Những điểm cần lưu ý'),
  p('Để theo dõi chủ đề này một cách có hệ thống, có thể bắt đầu từ ba nhóm nội dung sau:'),
  bullet('Chính sách & pháp lý:', 'cập nhật định hướng, văn bản và những thông tin liên quan đến hoạt động của ngành.'),
  bullet('Thị trường & đầu tư:', 'góc nhìn và nguồn tham khảo về thị trường, chuỗi giá trị và cơ hội phát triển.'),
  bullet('Công nghệ & đổi mới:', 'thông tin về giải pháp, công nghệ và thực tiễn triển khai nhiên liệu sinh học.'),
  {
    _type: 'callout',
    title: 'ĐIỂM CHÍNH',
    text: 'Kết nối doanh nghiệp, chuyên gia và đối tác; chia sẻ thông tin, tri thức và cơ hội hợp tác trong hệ sinh thái nhiên liệu sinh học Việt Nam.',
  },
  h2('Hướng theo dõi tiếp theo'),
  p('Thư viện của VBFA tập hợp và phân loại nội dung theo chủ đề, thời gian, giúp việc tìm hiểu ngành thuận tiện hơn. Độc giả quan tâm có thể đăng ký nhận bản tin để theo dõi các cập nhật và hoạt động nổi bật của VBFA.'),
];

interface Row {
  slug: string;
  category: Category;
  kicker: string;
  date: string;
  minutes: number;
  title: string;
  excerpt: string;
  image: keyof typeof ART;
}

const rows: Row[] = [
  { slug: 'dong-luc-tuong-lai', category: 'news', kicker: 'TIN NGÀNH · GÓC NHÌN', date: '2026-10-21', minutes: 6, image: 'industry',
    title: 'Những động lực định hình tương lai nhiên liệu sinh học tại Việt Nam',
    excerpt: 'Khám phá các chuyển động chính sách, thị trường và công nghệ đang mở ra cơ hội cho nhiên liệu sinh học.' },
  { slug: 'khong-gian-doi-thoai', category: 'activity', kicker: 'HOẠT ĐỘNG · KẾT NỐI', date: '2026-10-16', minutes: 4, image: 'community',
    title: 'Không gian đối thoại và kết nối cộng đồng doanh nghiệp',
    excerpt: 'Những kết nối, sáng kiến và hoạt động hợp tác thúc đẩy trao đổi trong cộng đồng ngành.' },
  { slug: 'tong-hop-chinh-sach', category: 'policy', kicker: 'CHÍNH SÁCH · TRI THỨC', date: '2026-10-10', minutes: 5, image: 'knowledge',
    title: 'Tổng hợp thông tin chính sách và tài liệu tham khảo cho ngành',
    excerpt: 'Tiếp cận các nhóm tài liệu, văn bản và nguồn thông tin hữu ích cho việc tìm hiểu lĩnh vực.' },
  { slug: 'chuoi-gia-tri', category: 'news', kicker: 'TIN NGÀNH · THỊ TRƯỜNG', date: '2026-10-03', minutes: 5, image: 'feedstock',
    title: 'Chuỗi giá trị nhiên liệu sinh học: từ nguyên liệu đến thị trường',
    excerpt: 'Góc nhìn và nguồn tham khảo về thị trường, chuỗi giá trị và cơ hội phát triển.' },
  { slug: 'noi-dung-chinh-sach', category: 'policy', kicker: 'CHÍNH SÁCH · PHÁP LÝ', date: '2026-09-26', minutes: 4, image: 'analytics',
    title: 'Những nội dung chính sách doanh nghiệp nên theo dõi',
    excerpt: 'Cập nhật định hướng, văn bản và những thông tin liên quan đến hoạt động của ngành.' },
  { slug: 'toa-dam-chuyen-mon', category: 'activity', kicker: 'HOẠT ĐỘNG · TRI THỨC', date: '2026-09-19', minutes: 3, image: 'networking',
    title: 'Tọa đàm chuyên môn dành cho hội viên và đối tác',
    excerpt: 'Chia sẻ tài liệu, tọa đàm và nguồn kiến thức có giá trị đối với cộng đồng.' },
  { slug: 'cong-nghe-doi-moi', category: 'news', kicker: 'TIN NGÀNH · CÔNG NGHỆ', date: '2026-09-12', minutes: 6, image: 'plant',
    title: 'Công nghệ và đổi mới: các hướng tiếp cận đáng chú ý',
    excerpt: 'Thông tin về giải pháp, công nghệ và thực tiễn triển khai nhiên liệu sinh học.' },
  { slug: 'phat-trien-ben-vung-esg', category: 'news', kicker: 'TIN NGÀNH · BỀN VỮNG', date: '2026-09-05', minutes: 5, image: 'logistics',
    title: 'Phát triển bền vững và các tiêu chí ESG trong ngành',
    excerpt: 'Trao đổi về hiệu quả môi trường, chuyển dịch năng lượng và các tiêu chí ESG.' },
  { slug: 'hop-tac-quoc-te', category: 'activity', kicker: 'HOẠT ĐỘNG · QUỐC TẾ', date: '2026-08-29', minutes: 4, image: 'networking',
    title: 'Hợp tác quốc tế: kết nối đối tác và chia sẻ kinh nghiệm',
    excerpt: 'Kết nối đối tác, chia sẻ kinh nghiệm và mở rộng các cơ hội hợp tác.' },
  { slug: 'tra-cuu-thu-vien', category: 'policy', kicker: 'CHÍNH SÁCH · TƯ LIỆU', date: '2026-08-22', minutes: 3, image: 'knowledge',
    title: 'Thư viện tài liệu: cách tra cứu theo chủ đề và thời gian',
    excerpt: 'Tập hợp và phân loại nội dung theo chủ đề, thời gian.' },
];

export const articlesSeed: Article[] = rows.map((r) => {
  const image = ART[r.image]!;
  return {
    id: `seed-${r.slug}`,
    slug: r.slug,
    category: r.category,
    kicker: r.kicker,
    publishedAt: `${r.date}T08:00:00+07:00`,
    readingMinutes: r.minutes,
    title: r.title,
    excerpt: r.excerpt,
    cover: image,
    body: sampleBody(image),
    seo: { noIndex: false },
  };
});
