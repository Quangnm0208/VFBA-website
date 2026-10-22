import { $, $$, mq } from './dom';

/** Year in the footer, scroll progress bar, header shadow and back-to-top button. */
export function initChrome(): void {
  $$('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  const bar = $('.progress');
  const header = $('.site-header');
  const topBtn = $('.back-top');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY || 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (bar) bar.style.transform = `scaleX(${Math.min(1, y / max)})`;
      header?.classList.toggle('is-scrolled', y > 12);
      if (topBtn) {
        const on = y > 640;
        topBtn.classList.toggle('is-on', on);
        topBtn.setAttribute('aria-hidden', String(!on));
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
  topBtn?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: mq('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' }));
}
