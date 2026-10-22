import { $, mq } from './dom';

/**
 * Hero (home page and news page head):
 *  - pointer parallax through --hx / --hy (skipped for reduced motion and touch devices),
 *  - pauses the endless background animations while the hero is off screen (battery / CPU on phones).
 */
export function initHero(): void {
  const hero = $('[data-hero]');
  if (!hero) return;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => hero.classList.toggle('is-offscreen', !entry?.isIntersecting), { rootMargin: '120px 0px' }).observe(hero);
  }

  if (mq('(prefers-reduced-motion: reduce)') || !mq('(hover: hover)')) return;
  let raf = 0;
  let tx = 0;
  let ty = 0;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const apply = () => {
    raf = 0;
    hero.style.setProperty('--hx', tx.toFixed(3));
    hero.style.setProperty('--hy', ty.toFixed(3));
  };
  window.addEventListener(
    'pointermove',
    (event) => {
      const r = hero.getBoundingClientRect();
      if (event.clientY < r.top || event.clientY > r.bottom) {
        if (tx || ty) {
          tx = 0;
          ty = 0;
          if (!raf) raf = requestAnimationFrame(apply);
        }
        return;
      }
      tx = clamp(((event.clientX - r.left) / r.width) * 2 - 1);
      ty = clamp(((event.clientY - r.top) / r.height) * 2 - 1);
      if (!raf) raf = requestAnimationFrame(apply);
    },
    { passive: true },
  );
}
