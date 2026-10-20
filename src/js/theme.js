import { onUiLanguageChange, t } from './settings.js';

const KEY = 'color-scheme';
const media = matchMedia('(prefers-color-scheme: dark)');
const meta = /** @type {HTMLMetaElement | null} */ (
  document.querySelector('meta[name="color-scheme"]')
);

/** @returns {'light' | 'dark' | null} */
function readPinned() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** @param {'light' | 'dark' | null} pinned */
function apply(pinned) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (pinned) root.classList.add(pinned);
  if (meta) meta.content = pinned ?? 'light dark';
  try {
    if (pinned) localStorage.setItem(KEY, pinned);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unvailable: The theme remains valid for this session.
  }
}

/**
 * @param {'light' | 'dark' | null} pinned
 * @returns {import('./settings.js').MessageKey}
 */
function titleKey(pinned) {
  if (pinned) return 'theme.toSystem';
  return media.matches ? 'theme.toLight' : 'theme.toDark';
}

/** @param {HTMLButtonElement} button */
export function initThemeToggle(button) {
  const sync = () => {
    const pinned = readPinned();
    button.setAttribute('aria-pressed', String(pinned !== null));
    button.title = t(titleKey(pinned));
  };

  button.addEventListener('click', () => {
    const pinned = readPinned();
    const nextTheme = media.matches ? 'light' : 'dark';
    apply(pinned ? null : nextTheme);
    sync();
  });
  media.addEventListener('change', sync);
  onUiLanguageChange(sync);
  sync();
}
