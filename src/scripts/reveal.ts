import { $$, mq } from './dom';

/**
 * Reveal on scroll. Each [data-rv] gets data-in when it enters the viewport (20%, bottom margin -8%),
 * then data-done 2s later so hover transitions work independently.
 * Shown immediately (no animation) for reduced motion, no IntersectionObserver, a hidden tab at load
 * (the observer does not run there) and when printing.
 */
export function initReveal(): void {
  const items = $$('[data-rv]');
  if (!items.length) return;
  const finish = (el: Element) => el.setAttribute('data-done', '');
  const showNow = (el: Element) => {
    el.setAttribute('data-in', '');
    finish(el);
  };
  window.addEventListener('beforeprint', () => items.forEach((el) => !el.hasAttribute('data-in') && showNow(el)));
  if (mq('(prefers-reduced-motion: reduce)') || !('IntersectionObserver' in window) || document.visibilityState === 'hidden') {
    items.forEach(showNow);
    return;
  }
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        entry.target.setAttribute('data-in', '');
        setTimeout(() => finish(entry.target), 2000);
      }),
    { threshold: 0.2, rootMargin: '0px 0px -8% 0px' },
  );
  items.forEach((el) => observer.observe(el));
}
