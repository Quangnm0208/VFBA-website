/**
 * Minimal auto-escaping HTML templating for the CRM (server-rendered, no client script).
 * Every interpolated value is escaped unless it is an explicit `Safe` fragment (another `html` result or `raw()`),
 * so a lead's name or message can never become markup.
 */
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]!);

export class Safe {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

/** Marks a string as already-safe markup. Only for constants written in this codebase, never for user data. */
export const raw = (value: string): Safe => new Safe(value);

function render(value: unknown): string {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0]!;
  values.forEach((value, i) => {
    out += render(value) + strings[i + 1]!;
  });
  return new Safe(out);
}
