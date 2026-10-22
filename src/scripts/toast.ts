import { $ } from './dom';

let timer: number | undefined;

/** Status message at the bottom of the screen; auto-hides after 4.5s. */
export function toast(message: string): void {
  const el = $('.toast');
  const msg = el && $('.toast__msg', el);
  if (!el || !msg) return;
  window.clearTimeout(timer);
  msg.textContent = message;
  el.hidden = false;
  timer = window.setTimeout(() => {
    el.hidden = true;
  }, 4500);
}
