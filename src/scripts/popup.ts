import { $, mq } from './dom';
import { hasActiveOverlay, openOverlay } from './overlays';

/**
 * Pop-up campaigns authored in Sanity. The page is static, so everything that depends on the visitor or the
 * clock is evaluated here: schedule window, frequency cap (per browser, per revision of the pop-up), trigger
 * (delay / scroll depth / exit intent) and "do not interrupt" rules (open dialog, typing in a field, hidden tab).
 */
interface PopupConfig {
  id: string;
  revision: string;
  trigger: 'delay' | 'scroll' | 'exit';
  delaySeconds: number;
  scrollPercent: number;
  frequency: 'session' | 'daily' | 'weekly' | 'once';
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
}
interface Record_ { rev: string; at: number }

const DAY = 86_400_000;
const keyOf = (id: string) => `vbfa:popup:${id}`;
const storeFor = (cfg: PopupConfig) => (cfg.frequency === 'session' ? window.sessionStorage : window.localStorage);

function readRecord(cfg: PopupConfig): Record_ | null {
  try {
    const raw = storeFor(cfg).getItem(keyOf(cfg.id));
    return raw ? (JSON.parse(raw) as Record_) : null;
  } catch {
    return null;
  }
}
function writeRecord(cfg: PopupConfig): void {
  try {
    storeFor(cfg).setItem(keyOf(cfg.id), JSON.stringify({ rev: cfg.revision, at: Date.now() } satisfies Record_));
  } catch {
    /* storage unavailable: the pop-up may show again, which is acceptable */
  }
}

function eligible(cfg: PopupConfig, now: number): boolean {
  if (cfg.startsAt && now < Date.parse(cfg.startsAt)) return false;
  if (cfg.endsAt && now > Date.parse(cfg.endsAt)) return false;
  const record = readRecord(cfg);
  if (!record || record.rev !== cfg.revision) return true;
  if (cfg.frequency === 'once' || cfg.frequency === 'session') return false;
  return now - record.at >= (cfg.frequency === 'daily' ? DAY : 7 * DAY);
}

const typing = () => {
  const el = document.activeElement;
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
};

export function initPopup(): void {
  const raw = $('#popup-config')?.textContent;
  if (!raw) return;
  let configs: PopupConfig[];
  try {
    configs = JSON.parse(raw) as PopupConfig[];
  } catch {
    return;
  }
  const cfg = configs.filter((c) => eligible(c, Date.now())).sort((a, b) => b.priority - a.priority)[0];
  if (!cfg) return;

  let done = false;
  let attempts = 0;
  const show = () => {
    if (done) return;
    if (hasActiveOverlay() || typing() || document.visibilityState !== 'visible') {
      if (++attempts <= 3) window.setTimeout(show, 5000);
      return;
    }
    done = true;
    writeRecord(cfg);
    openOverlay('popup', cfg.id);
  };

  const touch = !mq('(hover: hover)');
  const trigger = cfg.trigger === 'exit' && touch ? 'delay' : cfg.trigger;
  if (trigger === 'delay') {
    window.setTimeout(show, (cfg.trigger === 'exit' ? 20 : cfg.delaySeconds) * 1000);
  } else if (trigger === 'scroll') {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && (window.scrollY / max) * 100 >= cfg.scrollPercent) {
        window.removeEventListener('scroll', onScroll);
        show();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  } else {
    const armedAt = Date.now() + 5000;
    document.addEventListener('mouseout', (event) => {
      if (Date.now() >= armedAt && !event.relatedTarget && event.clientY <= 0) show();
    });
  }
}
