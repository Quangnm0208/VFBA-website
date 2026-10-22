const VN_TZ = 'Asia/Ho_Chi_Minh';

/** "2026-10-21T08:00:00+07:00" -> "21/10/2026" (Vietnam time, as shown in the design). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Date-only ISO string for JSON-LD / sitemap. */
export function isoDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: VN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Lower-case with Vietnamese locale rules; used for the client-side filter/search index. */
export const normVi = (text: string): string => text.toLocaleLowerCase('vi');

/** Heading text -> anchor id ("Bối cảnh" -> "boi-canh"). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const pad2 = (n: number): string => String(n).padStart(2, '0');
