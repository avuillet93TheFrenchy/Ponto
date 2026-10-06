import { isTauriRuntime } from '@tauri/index.js';
import { applyTranslations } from '@js/settings.js';

const NATIVE_URL = 'https://github.com/avuillet93TheFrenchy/Ponto/releases/latest';
const DISMISSED_KEY = 'ponto-install-dismissed';

/** @typedef {'windows' | 'android' | 'ios' | 'mac' | 'linux' | 'other'} Platform */

/**
 * @typedef {Event & { prompt: () => Promise<unknown> }} InstallPromptEvent
 */

/**
 * Guesses the visitor's platform from `userAgentData.platform` when present,
 * else from the user-agent string. iPadOS Safari pretends to be a Mac but has
 * a touch screen, so it counts as iOS.
 * @param {Navigator} [nav]
 * @returns {Platform}
 */
export function detectPlatform(nav = navigator) {
  const hint = /** @type {{ userAgentData?: { platform?: string } }} */ (nav).userAgentData?.platform;
  const source = hint || nav.userAgent || '';
  if (/windows/i.test(source)) return 'windows';
  if (/android/i.test(source)) return 'android';
  if (/iphone|ipad|ipod|\bios\b/i.test(source)) return 'ios';
  if (/mac/i.test(source)) return nav.maxTouchPoints > 1 ? 'ios' : 'mac';
  if (/linux|cros|chrome os|x11/i.test(source)) return 'linux';
  return 'other';
}

/**
 * Whether the page already runs as an installed app.
 * @param {Window} [win]
 * @returns {boolean}
 */
export function isStandalone(win = window) {
  const nav = /** @type {Navigator & { standalone?: boolean }} */ (win.navigator);
  return win.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

/** @param {Window} win */
function wasDismissed(win) {
  try {
    return win.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** @param {Window} win */
function rememberDismissed(win) {
  try {
    win.localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Blocked storage: the banner just comes back next visit.
  }
}

/** @param {string} id */
function byId(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/**
 * Shows the install banner where it helps: a link to the native app on Windows
 * and Android, the PWA install flow elsewhere. Does nothing inside Tauri, when
 * already installed, or after the visitor chose « Plus tard ».
 * @param {Window} [win]
 */
export function initInstallBanner(win = window) {
  if (isTauriRuntime() || isStandalone(win) || wasDismissed(win)) return;
  const banner = document.getElementById('install');
  if (!banner) return;

  const text = byId('install-text');
  const keys = byId('install-keys');
  const accept = byId('install-accept');
  const native = /** @type {HTMLAnchorElement} */ (byId('install-native'));

  /** @param {'install.native' | 'install.ios' | 'install.mac'} key */
  const show = (key) => {
    text.dataset.i18n = key;
    applyTranslations(banner);
    banner.hidden = false;
  };

  byId('install-later').addEventListener('click', () => {
    banner.hidden = true;
    rememberDismissed(win);
  });

  const platform = detectPlatform(win.navigator);
  if (platform === 'windows' || platform === 'android') {
    // Leave beforeinstallprompt alone so the browser keeps its own install UI.
    native.href = NATIVE_URL;
    native.target = '_blank';
    native.rel = 'noopener noreferrer';
    native.hidden = false;
    show('install.native');
    return;
  }
  if (platform === 'ios') {
    keys.hidden = false;
    show('install.ios');
    return;
  }
  if (platform === 'mac' && /safari/i.test(win.navigator.userAgent) && !/chrome|chromium|edg|opr|firefox/i.test(win.navigator.userAgent)) {
    show('install.mac');
    return;
  }

  /** @type {InstallPromptEvent | undefined} */
  let deferred;
  win.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = /** @type {InstallPromptEvent} */ (event);
    accept.hidden = false;
    banner.hidden = false;
  });
  accept.addEventListener('click', async () => {
    const pending = deferred;
    deferred = undefined;
    banner.hidden = true;
    try {
      await pending?.prompt();
    } catch {
      // The event can be used once: the browser's own install UI stays available.
    }
  });
  // Installed through the browser's own UI: nothing left to offer.
  win.addEventListener('appinstalled', () => {
    deferred = undefined;
    banner.hidden = true;
  });
}
