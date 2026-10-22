import { $, $$ } from './dom';

/** Home page: news filter chips and the active nav link for the section in view. */
export function initHome(): void {
  const grid = $('#nh-grid');
  const mode = grid?.dataset.filterMode ?? 'hide';
  const status = $('#news-filter-status');
  const chips = $$<HTMLElement>('[data-filter]');
  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      if (!grid) return;
      let matching = 0;
      $$<HTMLElement>('.ncard', grid).forEach((card) => {
        const on = key === 'all' || card.dataset.cat === key;
        if (on) matching += 1;
        card.classList.toggle('is-dim', !on && mode === 'dim');
        card.hidden = !on && mode === 'hide';
        if (on) card.removeAttribute('aria-hidden');
        else card.setAttribute('aria-hidden', 'true');
        $$<HTMLAnchorElement>('a', card).forEach((a) => {
          a.tabIndex = on ? 0 : -1;
        });
      });
      if (status) status.textContent = `${matching} bài viết trong danh mục đã chọn.`;
    }),
  );

  const links = $$<HTMLAnchorElement>('.nav a[data-section]');
  if ('IntersectionObserver' in window && links.length) {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.removeAttribute('aria-current'));
          links.find((l) => l.dataset.section === entry.target.id)?.setAttribute('aria-current', 'location');
        }),
      { rootMargin: '-30% 0px -60% 0px' },
    );
    ['top', 'about', 'focus', 'news', 'membership', 'resources', 'contact'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
}
