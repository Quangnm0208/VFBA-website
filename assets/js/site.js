/* VBFA website: hành vi giao diện. Không phụ thuộc thư viện.
   Mỗi khối chỉ chạy khi trang có phần tử tương ứng (body[data-page] = home | news | article). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mq = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const body = document.body;
  const page = body.dataset.page;
  const root = body.dataset.root || './';
  const articles = window.VBFA_ARTICLES || [];
  const norm = (t) => (t || '').toLocaleLowerCase('vi');
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ARROW = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9"></path></svg>';

  $$('[data-year]').forEach((e) => { e.textContent = new Date().getFullYear(); });

  /* ---------- Hiện dần khi cuộn tới ----------
     Nhóm [data-rv]: khi vào khung nhìn thì thêm data-in (chạy chuỗi chuyển động trong CSS);
     2s sau thêm data-done để gỡ hoạt ảnh vào và trả quyền cho hiệu ứng hover.
     Hiện ngay (không hoạt ảnh) khi: giảm chuyển động, không có IntersectionObserver, trang tải trong tab ẩn
     (IntersectionObserver không chạy ở tab ẩn, ảnh chụp và xem trước sẽ trống), hoặc khi in / xuất PDF. */
  const rv = $$('[data-rv]');
  if (rv.length) {
    const finish = (el) => el.setAttribute('data-done', '');
    const showNow = (el) => { el.setAttribute('data-in', ''); finish(el); };
    window.addEventListener('beforeprint', () => rv.forEach((el) => { if (!el.hasAttribute('data-in')) showNow(el); }));
    if (mq('(prefers-reduced-motion: reduce)') || !('IntersectionObserver' in window) || document.visibilityState === 'hidden') {
      rv.forEach(showNow);
    } else {
      const rvo = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        rvo.unobserve(en.target);
        en.target.setAttribute('data-in', '');
        setTimeout(() => finish(en.target), 2000);
      }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
      rv.forEach((el) => rvo.observe(el));
    }
  }

  /* ---------- Thanh tiến trình, bóng header, nút lên đầu trang ---------- */
  const bar = $('.progress'), header = $('.site-header'), topBtn = $('.back-top');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY || 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (bar) bar.style.transform = 'scaleX(' + Math.min(1, y / max) + ')';
      if (header) header.classList.toggle('is-scrolled', y > 12);
      if (topBtn) { const on = y > 640; topBtn.classList.toggle('is-on', on); topBtn.tabIndex = on ? 0 : -1; topBtn.setAttribute('aria-hidden', String(!on)); }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
  if (topBtn) topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: mq('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' }));

  /* ---------- Toast ---------- */
  const toastEl = $('.toast');
  let toastTimer;
  const toast = (msg) => {
    clearTimeout(toastTimer);
    $('.toast__msg', toastEl).textContent = msg;
    toastEl.hidden = false;
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4500);
  };

  /* ---------- Lớp phủ: menu, tìm kiếm, form kết nối ---------- */
  let active = null, lastFocus = null;
  const focusables = (box) => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea', box).filter((n) => n.getClientRects().length);
  const setExpanded = (on) => $$('[data-open="menu"]').forEach((b) => b.setAttribute('aria-expanded', String(on)));
  function openOverlay(name) {
    const next = $('[data-overlay="' + name + '"]');
    if (!next) return;
    if (!active) lastFocus = document.activeElement;
    else if (active !== next) active.hidden = true;
    active = next;
    next.hidden = false;
    body.classList.add('is-locked');
    setExpanded(name === 'menu');
    if (name === 'search') renderResults();
    const f = $('[data-autofocus]', next) || focusables(next)[0];
    setTimeout(() => { if (f) f.focus(); }, 60);
  }
  function closeOverlay() {
    if (!active) return;
    active.hidden = true;
    active = null;
    body.classList.remove('is-locked');
    setExpanded(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); openOverlay(opener.dataset.open); return; }
    if (e.target.closest('[data-close]')) { closeOverlay(); return; }
    if (active && e.target === active) { closeOverlay(); return; }
    if (active && e.target.closest('.drawer__nav a, .results a')) closeOverlay();
  });
  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.key === 'Escape') { closeOverlay(); return; }
    if (e.key !== 'Tab') return;
    const nodes = focusables(active);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* Tìm kiếm: chỉ mục gồm các trang và toàn bộ bài viết */
  const here = (hash) => (page === 'home' ? '' : root + 'index.html') + hash;
  const pageIndex = [
    ['Trang chủ', here('#top')], ['Giới thiệu VBFA', here('#about')], ['Chính sách và pháp lý', here('#focus')],
    ['Thị trường và đầu tư', here('#focus')], ['Công nghệ và đổi mới', here('#focus')], ['Phát triển bền vững', here('#focus')],
    ['Hội viên và kết nối', here('#membership')], ['Tin tức và hoạt động', root + 'tin-tuc/index.html'],
    ['Thư viện và báo cáo', here('#resources')], ['Liên hệ', here('#contact')]
  ];
  const index = pageIndex.concat(articles.map((a) => [a.title, root + 'tin-tuc/' + a.id + '/index.html']));
  const searchInput = $('#search-input'), results = $('.results');
  function renderResults() {
    if (!searchInput || !results) return;
    const q = norm(searchInput.value.trim());
    const list = q ? index.filter((x) => norm(x[0]).includes(q)) : pageIndex.slice(0, 5);
    results.innerHTML = list.length
      ? list.map((x) => '<a href="' + esc(x[1]) + '"><span>' + esc(x[0]) + '</span>' + ARROW + '</a>').join('')
      : '<p>Không tìm thấy nội dung phù hợp với từ khóa.</p>';
  }
  if (searchInput) searchInput.addEventListener('input', renderResults);
  const searchForm = $('#search-form');
  if (searchForm) searchForm.addEventListener('submit', (e) => e.preventDefault());

  /* Form kết nối hội viên và bản tin (prototype: chỉ kiểm tra hợp lệ, chưa gửi dữ liệu) */
  const joinForm = $('#join-form');
  if (joinForm) joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!joinForm.reportValidity()) return;
    joinForm.reset();
    lastFocus = null;
    closeOverlay();
    toast('Form thử nghiệm hợp lệ. Chưa có dữ liệu nào được gửi hoặc lưu.');
  });
  $$('.newsletter form').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    f.reset();
    toast('Đã kiểm tra thao tác đăng ký. Chưa kết nối hệ thống gửi bản tin.');
  }));

  /* ---------- Trang chủ ---------- */
  if (page === 'home') {
    /* Lọc tin: data-filter-mode="dim" (mờ) hoặc "hide" (ẩn) trên #nh-grid */
    const grid = $('#nh-grid');
    const mode = (grid && grid.dataset.filterMode) || 'dim';
    const chips = $$('[data-filter]');
    chips.forEach((ch) => ch.addEventListener('click', () => {
      const k = ch.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === ch)));
      let matching = 0;
      $$('.ncard', grid).forEach((card) => {
        const on = k === 'all' || card.dataset.cat === k;
        if (on) matching++;
        card.classList.toggle('is-dim', !on && mode === 'dim');
        card.hidden = !on && mode === 'hide';
        if (on) card.removeAttribute('aria-hidden'); else card.setAttribute('aria-hidden', 'true');
        $$('a', card).forEach((a) => { a.tabIndex = on ? 0 : -1; });
      });
      const message = $('#news-filter-status');
      if (message) message.textContent = matching + ' bài viết trong danh mục đã chọn.';
    }));

    /* Đánh dấu mục menu theo section đang xem */
    const links = $$('.nav a[data-section]');
    if ('IntersectionObserver' in window && links.length) {
      const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.removeAttribute('aria-current'));
        const a = links.find((l) => l.dataset.section === en.target.id);
        if (a) a.setAttribute('aria-current', 'location');
      }), { rootMargin: '-30% 0px -60% 0px' });
      ['top', 'about', 'focus', 'news', 'membership', 'resources', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    }
  }

  /* Hero (trang chủ và đầu trang Tin tức): parallax theo con trỏ (bỏ qua khi giảm chuyển động hoặc thiết bị cảm ứng) */
  const hero = $('[data-hero]');
  if (hero && !mq('(prefers-reduced-motion: reduce)') && mq('(hover: hover)')) {
    let raf = 0, tx = 0, ty = 0;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const apply = () => { raf = 0; hero.style.setProperty('--hx', tx.toFixed(3)); hero.style.setProperty('--hy', ty.toFixed(3)); };
    window.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) {
        if (tx || ty) { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(apply); }
        return;
      }
      tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
  }

  /* ---------- Trang Tin tức: lọc, tìm kiếm, xem thêm, đồng bộ URL ---------- */
  if (page === 'news') {
    const CAT = { 'tin-nganh': 'news', 'hoat-dong': 'activity', 'chinh-sach': 'policy' };
    const SLUG = { news: 'tin-nganh', activity: 'hoat-dong', policy: 'chinh-sach' };
    const cards = $$('[data-card]');
    const feat = $('#feat'), count = $('#count'), empty = $('#empty'), moreBox = $('#more'), qInput = $('#nq');
    const clearBtns = $$('[data-clear]');
    const chips = $$('[data-cat-filter]');
    const sp = new URLSearchParams(location.search);
    let cat = CAT[sp.get('chuyen-muc')] || 'all';
    let q = sp.get('q') || '';
    let more = false;
    qInput.value = q;

    const sync = () => {
      const p = new URLSearchParams();
      if (cat !== 'all') p.set('chuyen-muc', SLUG[cat]);
      if (q) p.set('q', q);
      try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); } catch (_) { /* file:// */ }
    };
    const render = () => {
      const nq = norm(q.trim());
      const filtering = cat !== 'all' || !!nq;
      const match = (c) => (cat === 'all' || c.dataset.cat === cat) && (!nq || c.dataset.text.indexOf(nq) > -1);
      const pool = filtering ? cards.filter(match) : cards.slice(1);
      const limit = filtering || more ? pool.length : 6;
      const shown = pool.slice(0, limit);
      cards.forEach((c) => { c.hidden = shown.indexOf(c) < 0; });
      feat.hidden = filtering;
      chips.forEach((ch) => ch.setAttribute('aria-pressed', String(ch.dataset.catFilter === cat)));
      count.textContent = filtering ? pool.length + ' bài viết phù hợp' : cards.length + ' bài viết';
      $$('[data-clear-row]').forEach((b) => { b.hidden = !filtering; });
      empty.hidden = !(filtering && pool.length === 0);
      moreBox.hidden = filtering || more || pool.length <= 6;
    };
    chips.forEach((ch) => ch.addEventListener('click', () => { cat = ch.dataset.catFilter; more = false; render(); sync(); }));
    qInput.addEventListener('input', () => { q = qInput.value; more = false; render(); sync(); });
    clearBtns.forEach((b) => b.addEventListener('click', () => { cat = 'all'; q = ''; qInput.value = ''; more = false; render(); sync(); }));
    $('#more-btn').addEventListener('click', () => { more = true; render(); });
    render();
  }

  /* ---------- Trang Bài viết: mục lục, sao chép liên kết ---------- */
  if (page === 'article') {
    $$('[data-toc]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const el = document.getElementById(a.dataset.toc);
      if (el) { window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 104, behavior: mq('(prefers-reduced-motion: reduce)') ? 'auto' : 'smooth' }); el.setAttribute('tabindex','-1'); el.focus({ preventScroll: true }); }
    }));
    const copy = $('#copy-link');
    if (copy) copy.addEventListener('click', () => {
      const ok = () => toast('Đã sao chép liên kết bài viết.');
      const bad = () => toast('Không thể sao chép tự động. Hãy sao chép liên kết từ thanh địa chỉ.');
      try { navigator.clipboard.writeText(location.href.split('#')[0]).then(ok, bad); } catch (_) { bad(); }
    });
  }
})();
