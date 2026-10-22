import { PUBLIC_SEED_DEMO_POPUP } from 'astro:env/client';
import type { Popup } from '../schema';

/** No pop-up is shown by default. Editors create them in Sanity ("Pop-up"). */
const demo: Popup = {
  id: 'demo-welcome',
  revision: 'demo-1',
  heading: 'Kết nối cùng VBFA',
  body: 'Đăng ký quan tâm để nhận thông tin về hoạt động hội viên và các sự kiện của hiệp hội.',
  ctaLabel: 'Đăng ký quan tâm hội viên',
  ctaAction: 'join',
  dismissLabel: 'Để sau',
  trigger: 'delay',
  delaySeconds: 3,
  scrollPercent: 50,
  frequency: 'weekly',
  pages: ['home', 'news', 'article'],
  priority: 0,
};

export const popupSeed: Popup[] = PUBLIC_SEED_DEMO_POPUP ? [demo] : [];
