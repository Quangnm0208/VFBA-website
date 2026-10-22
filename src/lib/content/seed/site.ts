import type { SiteSettings } from '../schema';

/** Local fallback used when no Sanity project is configured (dev, previews, first deploy). */
export const siteSeed: SiteSettings = {
  name: 'VBFA',
  legalName: 'Hiệp hội Nhiên liệu Sinh học Việt Nam',
  englishName: 'Vietnam Biofuels Association',
  utilityLeft: 'VBFA · Hiệp hội Nhiên liệu Sinh học Việt Nam',
  utilityRight: 'TRI THỨC · KẾT NỐI · HỢP TÁC',
  footerBlurb: 'Nền tảng thông tin và kết nối dành cho cộng đồng nhiên liệu sinh học Việt Nam.',
  footerContact: 'Để trao đổi về hợp tác hoặc thông tin ngành, vui lòng gửi yêu cầu qua biểu mẫu kết nối.',
  footerContactCta: 'Mở biểu mẫu kết nối',
  newsletter: {
    title: 'Đón nhận cập nhật từ VBFA.',
    description: 'Theo dõi các cập nhật và hoạt động nổi bật của VBFA.',
    placeholder: 'Email của bạn',
    button: 'Đăng ký',
  },
  contact: {},
  social: [],
  forms: {
    joinTitle: 'Kết nối cùng VBFA',
    joinIntro: 'Chia sẻ nhu cầu kết nối để tìm hiểu thêm về hoạt động hội viên.',
    // Prototype wording ("...khi hệ thống chính thức được vận hành") replaced; needs legal review (README, Open items).
    consentText: 'Tôi đồng ý để VBFA sử dụng thông tin này nhằm liên hệ và phản hồi yêu cầu của tôi.',
    consentVersion: 'join-v2',
    // Same wording as before this became editable in the Studio; needs legal review like the membership sentence (docs/privacy/CONSENT_TEXTS.vi.md).
    newsletterConsentText: 'Tôi đồng ý nhận bản tin VBFA qua email và cho phép xử lý địa chỉ email để gửi bản tin.',
    newsletterConsentVersion: 'newsletter-v1',
    joinSuccess: 'Cảm ơn bạn. VBFA đã nhận được thông tin và sẽ liên hệ lại.',
    newsletterSuccess: 'Đã ghi nhận đăng ký nhận bản tin của bạn.',
    genericError: 'Chưa thể gửi lúc này. Vui lòng thử lại sau ít phút.',
  },
  seo: {
    title: 'VBFA | Hiệp hội Nhiên liệu Sinh học Việt Nam',
    description:
      'VBFA là không gian kết nối doanh nghiệp, chuyên gia và đối tác; chia sẻ thông tin, tri thức và cơ hội hợp tác trong hệ sinh thái nhiên liệu sinh học Việt Nam.',
    noIndex: false,
  },
};
