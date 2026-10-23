import { html, raw, type Safe } from './html';
import type { LeadDetail, LeadKind, LeadRow, LeadStatus, Role, StaffIdentity, StaffRow, WorkflowStatus } from './store';

/** Server-rendered CRM screens (Vietnamese). No script, no inline style: the CSP of these pages is `default-src 'none'; style-src 'self'`. */

export const KIND_LABEL: Record<LeadKind, string> = { membership: 'Quan tâm hội viên', newsletter: 'Đăng ký bản tin', contact: 'Liên hệ' };
export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Mới',
  contacted: 'Đang xử lý',
  qualified: 'Đủ điều kiện',
  closed: 'Đã đóng',
  unsubscribed: 'Đã huỷ đăng ký',
  deleted: 'Đã xoá',
};
export const ROLE_LABEL: Record<Role, string> = { admin: 'Quản trị', staff: 'Nhân viên' };
export const PAGE_SIZE = 25;

const formatter = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
export const formatTime = (iso: string | null | undefined): string => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? formatter.format(date) : '—';
};

export interface Flash {
  tone: 'ok' | 'error';
  text: string;
}

const flashBlock = (flash?: Flash) => (flash ? html`<p class="flash flash--${flash.tone}" role="${flash.tone === 'error' ? 'alert' : 'status'}">${flash.text}</p>` : '');

export function layout(title: string, body: Safe | string, staff?: StaffIdentity, current?: 'leads' | 'staff' | 'account'): Safe {
  const nav = staff
    ? html`<nav aria-label="Điều hướng chính" class="nav">
        <a href="/admin/leads/"${current === 'leads' ? raw(' aria-current="page"') : ''}>Khách quan tâm</a>
        ${staff.role === 'admin' ? html`<a href="/admin/staff/"${current === 'staff' ? raw(' aria-current="page"') : ''}>Người dùng CRM</a>` : ''}
        <a href="/admin/account/"${current === 'account' ? raw(' aria-current="page"') : ''}>Tài khoản</a>
      </nav>
      <div class="who">
        <span class="who__id">${staff.email} · ${ROLE_LABEL[staff.role]}</span>
        <form method="post" action="/admin/logout/"><button class="btn btn--ghost" type="submit">Đăng xuất</button></form>
      </div>`
    : '';
  return html`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<meta name="referrer" content="no-referrer">
<title>${title} · VBFA CRM</title>
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="stylesheet" href="/admin/crm.css">
</head>
<body>
<a class="skip" href="#main">Bỏ qua đến nội dung</a>
<header class="bar"><div class="bar__inner"><div class="brand"><strong>VBFA</strong><span>CRM · Beta</span></div>${nav}</div></header>
<p class="beta" role="note">Bản thử nghiệm (Beta): chỉ dùng dữ liệu thử cho đến khi chính sách bảo mật và nội dung đồng ý được duyệt.</p>
<main id="main" class="wrap">${body}</main>
</body>
</html>`;
}

export function errorPage(title: string, message: string, staff?: StaffIdentity): Safe {
  return layout(title, html`<section class="card card--narrow"><h1>${title}</h1><p>${message}</p>${staff ? html`<p><a class="btn" href="/admin/leads/">Về danh sách</a></p>` : html`<p><a class="btn" href="/admin/login/">Đăng nhập</a></p>`}</section>`, staff);
}

export const deniedPage = (email: string): Safe =>
  layout('Không có quyền', html`<section class="card card--narrow"><h1>Không có quyền truy cập</h1><p>Tài khoản <strong class="wrap-any">${email}</strong> chưa được cấp quyền dùng CRM hoặc đã bị vô hiệu hoá. Hãy liên hệ quản trị viên.</p><form method="post" action="/admin/logout/"><button class="btn" type="submit">Đăng xuất</button></form></section>`);

export function loginPage(opts: { error?: string; notice?: string; next?: string; email?: string } = {}): Safe {
  return layout('Đăng nhập', html`<section class="card card--narrow">
    <h1>Đăng nhập CRM</h1>
    <p class="muted">Chỉ dành cho nhân sự được mời. Tài khoản do quản trị viên cấp; không có đăng ký công khai.</p>
    ${flashBlock(opts.error ? { tone: 'error', text: opts.error } : opts.notice ? { tone: 'ok', text: opts.notice } : undefined)}
    <form method="post" action="/admin/login/" class="stack" autocomplete="on">
      <input type="hidden" name="next" value="${opts.next ?? ''}">
      <label class="field"><span>Email</span><input type="email" name="email" value="${opts.email ?? ''}" autocomplete="username" required maxlength="254" autofocus></label>
      <label class="field"><span>Mật khẩu</span><input type="password" name="password" autocomplete="current-password" required maxlength="200"></label>
      <button class="btn" type="submit">Đăng nhập</button>
    </form>
  </section>`);
}

export interface ListView {
  staff: StaffIdentity;
  rows: LeadRow[];
  total: number;
  page: number;
  filter: { kind?: LeadKind; status?: LeadStatus; from?: string; to?: string; q?: string };
  flash?: Flash;
}

export const leadsQuery = (filter: ListView['filter'], page: number): string => {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value) p.set(key, value);
  if (page > 1) p.set('page', String(page));
  const text = p.toString();
  return text ? `?${text}` : '';
};

export function leadsPage(view: ListView): Safe {
  const { staff, rows, total, page, filter } = view;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const kinds = staff.kinds;
  const statusOptions: LeadStatus[] = ['new', 'contacted', 'qualified', 'closed', 'unsubscribed'];
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const filtered = Boolean(filter.kind || filter.status || filter.from || filter.to || filter.q);
  return layout('Khách quan tâm', html`
  <h1>Khách quan tâm</h1>
  ${flashBlock(view.flash)}
  <form method="get" action="/admin/leads/" class="filters" role="search" aria-label="Lọc danh sách">
    <label class="field"><span>Tìm kiếm</span><input type="search" name="q" value="${filter.q ?? ''}" maxlength="100" placeholder="Tên, tổ chức hoặc email"></label>
    <label class="field"><span>Loại</span><select name="kind"><option value="">Tất cả</option>${kinds.map((k) => html`<option value="${k}"${filter.kind === k ? raw(' selected') : ''}>${KIND_LABEL[k]}</option>`)}</select></label>
    <label class="field"><span>Trạng thái</span><select name="status"><option value="">Tất cả</option>${statusOptions.map((s) => html`<option value="${s}"${filter.status === s ? raw(' selected') : ''}>${STATUS_LABEL[s]}</option>`)}</select></label>
    <label class="field"><span>Từ ngày</span><input type="date" name="from" value="${filter.from ?? ''}"></label>
    <label class="field"><span>Đến ngày</span><input type="date" name="to" value="${filter.to ?? ''}"></label>
    <div class="filters__actions"><button class="btn" type="submit">Lọc</button>${filtered ? html`<a class="btn btn--ghost" href="/admin/leads/">Xoá bộ lọc</a>` : ''}</div>
  </form>
  <p class="muted" aria-live="polite">${total === 0 ? 'Không có kết quả.' : `Hiển thị ${from}–${to} trong ${total} kết quả.`}</p>
  ${rows.length === 0
    ? html`<p class="empty">${filtered ? 'Không có khách nào khớp bộ lọc.' : 'Chưa có khách nào gửi biểu mẫu.'}</p>`
    : html`<div class="table-wrap" role="region" aria-label="Danh sách khách quan tâm" tabindex="0">
    <table class="table">
      <caption class="sr">Khách quan tâm, mới nhất trước</caption>
      <thead><tr><th scope="col">Nhận lúc</th><th scope="col">Người gửi</th><th scope="col">Loại</th><th scope="col">Trạng thái</th><th scope="col" class="col-opt">Tổ chức</th><th scope="col" class="col-opt">Ghi chú</th><th scope="col"><span class="sr">Mở</span></th></tr></thead>
      <tbody>${rows.map((r) => html`<tr>
        <td>${formatTime(r.created_at)}</td>
        <td><span class="strong">${r.name || '(không có tên)'}</span><br><span class="muted wrap-any">${r.email}</span></td>
        <td>${KIND_LABEL[r.kind]}</td>
        <td><span class="badge badge--${r.status}">${STATUS_LABEL[r.status]}</span></td>
        <td class="col-opt">${r.company || '—'}</td>
        <td class="col-opt">${r.notes}</td>
        <td><a class="btn btn--small" href="/admin/leads/${r.id}/">Xem<span class="sr"> ${r.name || r.email}</span></a></td>
      </tr>`)}</tbody>
    </table></div>`}
  ${pages > 1
    ? html`<nav class="pager" aria-label="Phân trang">
        ${page > 1 ? html`<a class="btn btn--ghost" rel="prev" href="/admin/leads/${leadsQuery(filter, page - 1)}">‹ Trang trước</a>` : html`<span class="btn btn--ghost btn--off" aria-disabled="true">‹ Trang trước</span>`}
        <span>Trang ${page} / ${pages}</span>
        ${page < pages ? html`<a class="btn btn--ghost" rel="next" href="/admin/leads/${leadsQuery(filter, page + 1)}">Trang sau ›</a>` : html`<span class="btn btn--ghost btn--off" aria-disabled="true">Trang sau ›</span>`}
      </nav>`
    : ''}`, staff, 'leads');
}

const TRANSITION_LABEL: Record<WorkflowStatus, string> = { new: 'Đưa về “Mới”', contacted: 'Chuyển sang “Đang xử lý”', closed: 'Đóng (“Đã đóng”)' };

export function leadPage(staff: StaffIdentity, detail: LeadDetail, flash?: Flash): Safe {
  const { lead, notes } = detail;
  const editable = lead.status === 'new' || lead.status === 'contacted' || lead.status === 'closed' || lead.status === 'qualified';
  const targets = (['new', 'contacted', 'closed'] as const).filter((s) => s !== lead.status);
  const utm = Object.entries(lead.utm ?? {});
  return layout(lead.name || lead.email, html`
  <p><a href="/admin/leads/">‹ Danh sách</a></p>
  <h1>${lead.name || '(không có tên)'} <span class="badge badge--${lead.status}">${STATUS_LABEL[lead.status]}</span></h1>
  ${flashBlock(flash)}
  <div class="grid">
    <section class="card" aria-labelledby="h-info">
      <h2 id="h-info">Thông tin</h2>
      <dl class="dl">
        <dt>Loại</dt><dd>${KIND_LABEL[lead.kind]}</dd>
        <dt>Email</dt><dd class="wrap-any">${lead.email}</dd>
        <dt>Điện thoại</dt><dd>${lead.phone || '—'}</dd>
        <dt>Tổ chức</dt><dd>${lead.company || '—'}</dd>
        <dt>Quan tâm</dt><dd>${lead.interest || '—'}</dd>
        <dt>Nội dung</dt><dd class="pre">${lead.message || '—'}</dd>
        <dt>Nhận lúc</dt><dd>${formatTime(lead.created_at)}</dd>
        <dt>Cập nhật</dt><dd>${formatTime(lead.updated_at)}</dd>
      </dl>
    </section>
    <section class="card" aria-labelledby="h-consent">
      <h2 id="h-consent">Đồng ý &amp; nguồn</h2>
      <dl class="dl">
        <dt>Đồng ý</dt><dd>${lead.consent ? 'Có' : 'Không ghi nhận'}</dd>
        <dt>Thời điểm đồng ý</dt><dd>${formatTime(lead.consent_at)}</dd>
        <dt>Phiên bản nội dung</dt><dd><code>${lead.consent_text_version}</code></dd>
        <dt>Trang gửi</dt><dd><code>${lead.source_path}</code></dd>
        <dt>UTM</dt><dd>${utm.length ? utm.map(([k, v]) => html`<code>${k}=${v}</code> `) : '—'}</dd>
      </dl>
    </section>
  </div>
  <section class="card" aria-labelledby="h-status">
    <h2 id="h-status">Trạng thái</h2>
    ${editable
      ? html`<form method="post" action="/admin/leads/${lead.id}/status/" class="row">
          <input type="hidden" name="from" value="${lead.status}">
          ${targets.map((t) => html`<button class="btn${t === 'closed' ? ' btn--ghost' : ''}" type="submit" name="to" value="${t}">${TRANSITION_LABEL[t]}</button>`)}
        </form>`
      : html`<p class="muted">Trạng thái này không thay đổi được từ CRM.</p>`}
  </section>
  <section class="card" aria-labelledby="h-notes">
    <h2 id="h-notes">Ghi chú nội bộ</h2>
    ${notes.length === 0
      ? html`<p class="muted">Chưa có ghi chú.</p>`
      : html`<ol class="notes">${notes.map((n) => html`<li><p class="pre">${n.body}</p><p class="muted"><span class="strong">${n.author_email}</span> · <time datetime="${n.created_at}">${formatTime(n.created_at)}</time></p></li>`)}</ol>`}
    <form method="post" action="/admin/leads/${lead.id}/note/" class="stack">
      <label class="field"><span>Thêm ghi chú (tối đa 2000 ký tự)</span><textarea name="body" rows="4" maxlength="2000" required></textarea></label>
      <div><button class="btn" type="submit">Lưu ghi chú</button></div>
    </form>
  </section>`, staff, 'leads');
}

export function staffPage(staff: StaffIdentity, rows: StaffRow[], flash?: Flash): Safe {
  return layout('Người dùng CRM', html`
  <h1>Người dùng CRM</h1>
  ${flashBlock(flash)}
  <p class="muted">Tài khoản đăng nhập do quản trị tạo trong Supabase (chỉ mời, không đăng ký công khai). Ở đây cấp vai trò và phạm vi cho email đó.</p>
  <div class="table-wrap" role="region" aria-label="Danh sách người dùng CRM" tabindex="0">
    <table class="table">
      <caption class="sr">Người dùng CRM</caption>
      <thead><tr><th scope="col">Email</th><th scope="col">Vai trò</th><th scope="col">Phạm vi</th><th scope="col">Trạng thái</th><th scope="col" class="col-opt">Đăng nhập gần nhất</th><th scope="col"><span class="sr">Thao tác</span></th></tr></thead>
      <tbody>${rows.map((s) => html`<tr>
        <td class="wrap-any">${s.email}</td>
        <td>${ROLE_LABEL[s.role]}</td>
        <td>${s.kinds.map((k) => KIND_LABEL[k]).join(', ')}</td>
        <td>${s.active ? (s.bound ? 'Đang hoạt động' : 'Đã cấp quyền, chưa đăng nhập') : 'Đã vô hiệu hoá'}</td>
        <td class="col-opt">${formatTime(s.last_login_at)}</td>
        <td><form method="post" action="/admin/staff/"><input type="hidden" name="email" value="${s.email}">
          <button class="btn btn--small${s.active ? ' btn--ghost' : ''}" type="submit" name="action" value="${s.active ? 'deactivate' : 'activate'}">${s.active ? 'Vô hiệu hoá' : 'Kích hoạt lại'}<span class="sr"> ${s.email}</span></button></form></td>
      </tr>`)}</tbody>
    </table>
  </div>
  <section class="card" aria-labelledby="h-add">
    <h2 id="h-add">Cấp quyền hoặc cập nhật</h2>
    <form method="post" action="/admin/staff/" class="stack">
      <input type="hidden" name="action" value="upsert">
      <label class="field"><span>Email (đã có tài khoản trong Supabase Auth)</span><input type="email" name="email" required maxlength="254" autocomplete="off"></label>
      <label class="field"><span>Vai trò</span><select name="role"><option value="staff">Nhân viên (xem và cập nhật khách)</option><option value="admin">Quản trị (thêm quản lý người dùng)</option></select></label>
      <fieldset class="field"><legend>Phạm vi khách</legend>
        <label class="check"><input type="checkbox" name="kind" value="membership" checked> ${KIND_LABEL.membership}</label>
        <label class="check"><input type="checkbox" name="kind" value="newsletter" checked> ${KIND_LABEL.newsletter}</label>
        <label class="check"><input type="checkbox" name="kind" value="contact" checked> ${KIND_LABEL.contact}</label>
      </fieldset>
      <label class="check"><input type="checkbox" name="reset" value="1"> Đặt lại liên kết tài khoản (khi tài khoản Auth bị xoá và tạo lại)</label>
      <div><button class="btn" type="submit">Lưu</button></div>
    </form>
  </section>`, staff, 'staff');
}

export function accountPage(staff: StaffIdentity, flash?: Flash): Safe {
  return layout('Tài khoản', html`
  <h1>Tài khoản</h1>
  ${flashBlock(flash)}
  <section class="card card--narrow" aria-labelledby="h-me">
    <h2 id="h-me">Bạn đang đăng nhập</h2>
    <dl class="dl"><dt>Email</dt><dd class="wrap-any">${staff.email}</dd><dt>Vai trò</dt><dd>${ROLE_LABEL[staff.role]}</dd><dt>Phạm vi</dt><dd>${staff.kinds.map((k) => KIND_LABEL[k]).join(', ')}</dd></dl>
  </section>
  <section class="card card--narrow" aria-labelledby="h-pw">
    <h2 id="h-pw">Đổi mật khẩu</h2>
    <form method="post" action="/admin/account/" class="stack">
      <label class="field"><span>Mật khẩu hiện tại</span><input type="password" name="current" autocomplete="current-password" required maxlength="200"></label>
      <label class="field"><span>Mật khẩu mới (ít nhất 12 ký tự)</span><input type="password" name="next" autocomplete="new-password" required minlength="12" maxlength="200"></label>
      <label class="field"><span>Nhập lại mật khẩu mới</span><input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="200"></label>
      <div><button class="btn" type="submit">Đổi mật khẩu</button></div>
    </form>
  </section>`, staff, 'account');
}
