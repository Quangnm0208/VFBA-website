import { $, $$ } from './dom';
import { clearFocusReturn, closeOverlay } from './overlays';
import { toast } from './toast';

/**
 * Membership form and newsletter form -> Vercel API routes (/api/join, /api/newsletter).
 * Browser side only collects the fields; validation, anti-abuse and storage happen server side.
 * Anti-spam without friction: a hidden honeypot field and a "form opened at" timestamp (a human takes
 * more than a couple of seconds); Cloudflare Turnstile is added automatically when a site key is configured.
 */
interface ApiError { ok: false; code?: string; message?: string }
type ApiResult = { ok: true } | ApiError;

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, options: { sitekey: string; theme?: string; language?: string; appearance?: string }): string;
      reset(widgetId?: string): void;
    };
  }
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
const GENERIC_ERROR = 'Chưa thể gửi lúc này. Vui lòng thử lại sau ít phút.';

function utm(): Record<string, string> {
  const params = new URLSearchParams(location.search);
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 80);
  }
  return out;
}

function payload(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? '').trim();
  return {
    kind: form.dataset.kind,
    name: text('name'),
    company: text('company'),
    email: text('email'),
    phone: text('phone'),
    interest: text('interest'),
    message: text('message'),
    consent: data.get('consent') === 'on',
    consentVersion: form.dataset.consentVersion,
    website: text('website'),
    openedAt: Number(form.dataset.openedAt) || Date.now() - 5000,
    turnstileToken: text('cf-turnstile-response'),
    sourcePath: location.pathname,
    utm: utm(),
  };
}

async function send(form: HTMLFormElement): Promise<ApiResult> {
  try {
    const response = await fetch(form.dataset.endpoint ?? '', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload(form)),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(15000),
    });
    const body = (await response.json().catch(() => null)) as ApiResult | null;
    if (response.ok && body?.ok) return { ok: true };
    return { ok: false, code: body && !body.ok ? body.code : 'http_error', message: body && !body.ok ? body.message : undefined };
  } catch {
    return { ok: false, code: 'network' };
  }
}

function setBusy(form: HTMLFormElement, busy: boolean): void {
  const button = $<HTMLButtonElement>('button[type="submit"]', form);
  if (!button) return;
  button.disabled = busy;
  button.toggleAttribute('aria-busy', busy);
}

function showStatus(form: HTMLFormElement, message: string | null): void {
  const status = $('[data-status]', form);
  if (!status) return;
  status.hidden = !message;
  status.textContent = message ?? '';
}

let turnstileLoading: Promise<void> | undefined;
function loadTurnstile(): Promise<void> {
  return (turnstileLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile'));
    document.head.appendChild(script);
  }));
}

/** Renders the widget of one form (the join dialog or a newsletter band). Safe to call repeatedly. */
async function renderTurnstile(form: HTMLFormElement | null): Promise<void> {
  const slot = form ? $('[data-turnstile]', form) : null;
  if (!slot || slot.dataset.rendered) return;
  slot.dataset.rendered = '1';
  try {
    await loadTurnstile();
    slot.dataset.widgetId = window.turnstile?.render(slot, { sitekey: slot.dataset.sitekey ?? '', theme: 'light', language: 'vi', appearance: slot.dataset.appearance ?? 'always' }) ?? '';
  } catch {
    delete slot.dataset.rendered;
    turnstileLoading = undefined;
  }
}

const tokenOf = (form: HTMLFormElement): string => String(new FormData(form).get('cf-turnstile-response') ?? '');

/** A fast typist can submit before the (lazy, invisible) widget has produced its token: wait a few seconds for it. */
async function awaitToken(form: HTMLFormElement): Promise<void> {
  const slot = $('[data-turnstile]', form);
  if (!slot) return;
  void renderTurnstile(form);
  const deadline = Date.now() + 4000;
  while (!tokenOf(form) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 120));
}

function resetTurnstile(form: HTMLFormElement): void {
  const id = $('[data-turnstile]', form)?.dataset.widgetId;
  if (id) window.turnstile?.reset(id);
}

export function initForms(): void {
  const join = $<HTMLFormElement>('#join-form');
  const newsletters = $$<HTMLFormElement>('.newsletter form');

  const markOpened = (form: HTMLFormElement | null) => {
    if (form && !form.dataset.openedAt) form.dataset.openedAt = String(Date.now());
  };
  document.addEventListener('vbfa:overlay-open', (event) => {
    if ((event as CustomEvent<{ name: string }>).detail.name !== 'join') return;
    markOpened(join);
    void renderTurnstile(join);
  });
  // The newsletter widget is loaded on first interaction, not on page load (keeps the third-party script off the critical path).
  newsletters.forEach((form) =>
    form.addEventListener('focusin', () => {
      markOpened(form);
      void renderTurnstile(form);
    }, { once: true }),
  );
  markOpened(null);

  join?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!join.reportValidity()) return;
    showStatus(join, null);
    setBusy(join, true);
    await awaitToken(join);
    const result = await send(join);
    setBusy(join, false);
    if (result.ok) {
      join.reset();
      delete join.dataset.openedAt;
      clearFocusReturn();
      closeOverlay();
      toast(join.dataset.success ?? 'Đã gửi thông tin.');
      resetTurnstile(join);
      return;
    }
    showStatus(join, result.message ?? join.dataset.error ?? GENERIC_ERROR);
    resetTurnstile(join);
  });

  newsletters.forEach((form) =>
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      setBusy(form, true);
      await awaitToken(form);
      const result = await send(form);
      setBusy(form, false);
      if (result.ok) {
        form.reset();
        delete form.dataset.openedAt;
        toast(form.dataset.success ?? 'Đã ghi nhận đăng ký.');
      } else {
        toast(result.message ?? form.dataset.error ?? GENERIC_ERROR);
      }
      resetTurnstile(form);
    }),
  );
}
