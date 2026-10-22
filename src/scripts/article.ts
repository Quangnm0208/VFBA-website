import { $, $$, mq } from './dom';
import { toast } from './toast';

/** Article page: smooth table-of-contents scroll (header offset 104px) and "copy link". */
export function initArticle(): void {
  $$<HTMLAnchorElement>('[data-toc]').forEach((a) =>
    a.addEventListener('click', (event) => {
      event.preventDefault();
      const el = document.getElementById(a.dataset.toc ?? '');
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 104, behavior: mq('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' });
      // Keep keyboard / screen-reader position in sync with the scroll.
      el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
    }),
  );

  $('#copy-link')?.addEventListener('click', () => {
    const ok = () => toast('Đã sao chép liên kết bài viết.');
    const bad = () => toast('Không thể sao chép tự động. Hãy sao chép liên kết từ thanh địa chỉ.');
    try {
      void navigator.clipboard.writeText(location.href.split('#')[0] ?? location.href).then(ok, bad);
    } catch {
      bad();
    }
  });
}
