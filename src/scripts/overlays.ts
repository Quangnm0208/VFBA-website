import { $, $$ } from './dom';

/**
 * Menu drawer, search dialog, join form and pop-up share one overlay system:
 * [data-open] opens, [data-close] / backdrop / Esc closes; body scroll lock; Tab trap; focus returns to the opener.
 * Other modules react through the "vbfa:overlay-open" / "vbfa:overlay-close" events.
 */
let active: HTMLElement | null = null;
let lastFocus: HTMLElement | null = null;

const focusables = (box: HTMLElement) =>
  $$<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea', box).filter((n) => n.getClientRects().length);
const setExpanded = (on: boolean) => $$('[data-open="menu"]').forEach((b) => b.setAttribute('aria-expanded', String(on)));

export const hasActiveOverlay = (): boolean => active !== null;
export const clearFocusReturn = (): void => {
  lastFocus = null;
};

export function openOverlay(name: string, popupId?: string): void {
  const selector = popupId ? `[data-overlay="${name}"][data-popup-id="${CSS.escape(popupId)}"]` : `[data-overlay="${name}"]`;
  const next = $(selector);
  if (!next) return;
  if (!active) lastFocus = document.activeElement as HTMLElement | null;
  else if (active !== next) active.hidden = true;
  active = next;
  next.hidden = false;
  document.body.classList.add('is-locked');
  setExpanded(name === 'menu');
  document.dispatchEvent(new CustomEvent('vbfa:overlay-open', { detail: { name, id: popupId } }));
  const target = $('[data-autofocus]', next) ?? focusables(next)[0];
  // Move focus into the dialog once it is visible, but never pull it back to the first field when the visitor (or autofill,
  // or an assistive technology) has already put it somewhere inside the dialog.
  window.setTimeout(() => {
    if (!next.hidden && !next.contains(document.activeElement)) target?.focus();
  }, 60);
}

export function closeOverlay(): void {
  if (!active) return;
  const name = active.dataset.overlay ?? '';
  active.hidden = true;
  active = null;
  document.body.classList.remove('is-locked');
  setExpanded(false);
  lastFocus?.focus?.();
  lastFocus = null;
  document.dispatchEvent(new CustomEvent('vbfa:overlay-close', { detail: { name } }));
}

export function initOverlays(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    const opener = target.closest<HTMLElement>('[data-open]');
    if (opener) {
      event.preventDefault();
      openOverlay(opener.dataset.open ?? '');
      return;
    }
    if (target.closest('[data-close]')) {
      closeOverlay();
      return;
    }
    if (active && target === active) {
      closeOverlay();
      return;
    }
    if (active && target.closest('.drawer__nav a, .results a')) closeOverlay();
  });

  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (event.key === 'Escape') {
      closeOverlay();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = focusables(active);
    if (!nodes.length) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
