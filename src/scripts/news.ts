import { $, $$, norm } from './dom';

const CAT: Record<string, string> = { 'tin-nganh': 'news', 'hoat-dong': 'activity', 'chinh-sach': 'policy' };
const SLUG: Record<string, string> = { news: 'tin-nganh', activity: 'hoat-dong', policy: 'chinh-sach' };
const PAGE_SIZE = 6;

/** News list: category filter, live search, "load more", state mirrored in ?chuyen-muc=&q= so views can be shared. */
export function initNews(): void {
  const cards = $$<HTMLElement>('[data-card]');
  const feat = $('#feat');
  const count = $('#count');
  const empty = $('#empty');
  const moreBox = $('#more');
  const qInput = $<HTMLInputElement>('#nq');
  const moreBtn = $('#more-btn');
  if (!feat || !count || !empty || !moreBox || !qInput || !moreBtn) return;
  const chips = $$<HTMLElement>('[data-cat-filter]');

  const params = new URLSearchParams(location.search);
  let cat = CAT[params.get('chuyen-muc') ?? ''] ?? 'all';
  let q = params.get('q') ?? '';
  let more = false;
  qInput.value = q;

  const sync = () => {
    const p = new URLSearchParams();
    if (cat !== 'all') p.set('chuyen-muc', SLUG[cat] ?? '');
    if (q) p.set('q', q);
    try {
      history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : ''));
    } catch {
      /* file:// */
    }
  };

  const render = () => {
    const nq = norm(q.trim());
    const filtering = cat !== 'all' || !!nq;
    const match = (c: HTMLElement) => (cat === 'all' || c.dataset.cat === cat) && (!nq || (c.dataset.text ?? '').includes(nq));
    const pool = filtering ? cards.filter(match) : cards.slice(1);
    const limit = filtering || more ? pool.length : PAGE_SIZE;
    const shown = pool.slice(0, limit);
    cards.forEach((c) => {
      c.hidden = !shown.includes(c);
    });
    feat.hidden = filtering;
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.catFilter === cat)));
    count.textContent = filtering ? `${pool.length} bài viết phù hợp` : `${cards.length} bài viết`;
    $$('[data-clear-row]').forEach((b) => {
      b.hidden = !filtering;
    });
    empty.hidden = !(filtering && pool.length === 0);
    moreBox.hidden = filtering || more || pool.length <= PAGE_SIZE;
  };

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      cat = chip.dataset.catFilter ?? 'all';
      more = false;
      render();
      sync();
    }),
  );
  qInput.addEventListener('input', () => {
    q = qInput.value;
    more = false;
    render();
    sync();
  });
  $$('[data-clear]').forEach((b) =>
    b.addEventListener('click', () => {
      cat = 'all';
      q = '';
      qInput.value = '';
      more = false;
      render();
      sync();
    }),
  );
  moreBtn.addEventListener('click', () => {
    more = true;
    render();
  });
  render();
}
