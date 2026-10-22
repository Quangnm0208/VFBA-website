import { $, ARROW_SVG, esc, norm } from './dom';

type Entry = [label: string, href: string];
interface SearchIndex { pages: Entry[]; articles: Entry[] }

/** Site search: pages + articles from /search-index.json (built from the CMS), fetched on first open. */
export function initSearch(): void {
  const form = $<HTMLFormElement>('#search-form');
  const input = $<HTMLInputElement>('#search-input');
  const results = $('.results');
  if (!form || !input || !results) return;
  form.addEventListener('submit', (event) => event.preventDefault());

  let index: Promise<SearchIndex | null> | undefined;
  const load = () =>
    (index ??= fetch(form.dataset.index ?? '/search-index.json')
      .then((r) => (r.ok ? (r.json() as Promise<SearchIndex>) : null))
      .catch(() => null));

  const render = async () => {
    const data = await load();
    if (!data) {
      results.innerHTML = '<p>Chưa tải được dữ liệu tìm kiếm. Vui lòng thử lại.</p>';
      return;
    }
    const q = norm(input.value.trim());
    const all = [...data.pages, ...data.articles];
    const list = q ? all.filter(([label]) => norm(label).includes(q)) : data.pages.slice(0, 5);
    results.innerHTML = list.length
      ? list.map(([label, href]) => `<a href="${esc(href)}"><span>${esc(label)}</span>${ARROW_SVG}</a>`).join('')
      : '<p>Không tìm thấy nội dung phù hợp với từ khóa.</p>';
  };
  input.addEventListener('input', () => void render());
  document.addEventListener('vbfa:overlay-open', (event) => {
    if ((event as CustomEvent<{ name: string }>).detail.name === 'search') void render();
  });
}
