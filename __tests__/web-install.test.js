import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri/index.js', () => ({ isTauriRuntime: vi.fn() }));
vi.mock('@js/settings.js', () => ({ applyTranslations: vi.fn() }));

const { isTauriRuntime } = await import('@tauri/index.js');
const { detectPlatform, initInstallBanner, isStandalone } = await import('../src/js/web/install.js');

const NATIVE_URL = 'https://github.com/avuillet93TheFrenchy/Ponto/releases/latest';

const UA = {
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
};

/**
 * @param {string} userAgent
 * @param {{ maxTouchPoints?: number, platform?: string, standalone?: boolean }} [extra]
 * @returns {Navigator}
 */
function fakeNav(userAgent, extra = {}) {
  return /** @type {Navigator} */ (/** @type {unknown} */ ({
    userAgent,
    maxTouchPoints: extra.maxTouchPoints ?? 0,
    standalone: extra.standalone,
    userAgentData: extra.platform ? { platform: extra.platform } : undefined,
  }));
}

/**
 * @param {string} userAgent
 * @param {{ maxTouchPoints?: number, standalone?: boolean, displayStandalone?: boolean }} [extra]
 * @returns {Window}
 */
function fakeWin(userAgent, extra = {}) {
  return /** @type {Window} */ (/** @type {unknown} */ ({
    navigator: fakeNav(userAgent, extra),
    matchMedia: () => ({ matches: extra.displayStandalone ?? false }),
    addEventListener: (/** @type {string} */ type, /** @type {EventListener} */ fn) => window.addEventListener(type, fn),
    localStorage: window.localStorage,
  }));
}

/** @param {string} id */
function el(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

/** @returns {Event & { prompt: import('vitest').Mock }} */
function installEvent() {
  const event = /** @type {Event & { prompt: import('vitest').Mock }} */ (new Event('beforeinstallprompt', { cancelable: true }));
  event.prompt = vi.fn().mockResolvedValue(undefined);
  return event;
}

beforeEach(() => {
  vi.mocked(isTauriRuntime).mockReturnValue(false);
  localStorage.clear();
  document.body.innerHTML = `
    <aside id="install" hidden>
      <p id="install-text" data-i18n="install.native"></p>
      <p id="install-keys" data-i18n="install.keysNote" hidden></p>
      <a id="install-native" hidden></a>
      <button id="install-accept" type="button" hidden></button>
      <button id="install-later" type="button"></button>
    </aside>`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectPlatform', () => {
  it('detectPlatform : Windows, Android, iPhone, iPad (Macintosh + tactile), Mac, Linux, ChromeOS', () => {
    expect(detectPlatform(fakeNav(UA.windows))).toBe('windows');
    expect(detectPlatform(fakeNav(UA.android))).toBe('android');
    expect(detectPlatform(fakeNav(UA.iphone))).toBe('ios');
    expect(detectPlatform(fakeNav(UA.ipad, { maxTouchPoints: 5 }))).toBe('ios');
    expect(detectPlatform(fakeNav(UA.macSafari))).toBe('mac');
    expect(detectPlatform(fakeNav(UA.linux))).toBe('linux');
    expect(detectPlatform(fakeNav(UA.chromeos))).toBe('linux');
    expect(detectPlatform(fakeNav('SomethingElse/1.0'))).toBe('other');
  });

  it('reconnaît iOS annoncé par userAgentData.platform', () => {
    expect(detectPlatform(fakeNav(UA.macChrome, { platform: 'iOS' }))).toBe('ios');
  });

  it('préfère userAgentData.platform quand il existe', () => {
    expect(detectPlatform(fakeNav(UA.linux, { platform: 'Windows' }))).toBe('windows');
    expect(detectPlatform(fakeNav(UA.linux, { platform: 'Android' }))).toBe('android');
    expect(detectPlatform(fakeNav(UA.linux, { platform: 'macOS' }))).toBe('mac');
    expect(detectPlatform(fakeNav(UA.linux, { platform: 'Chrome OS' }))).toBe('linux');
  });
});

describe('isStandalone', () => {
  it('détecte display-mode standalone et navigator.standalone', () => {
    expect(isStandalone(fakeWin(UA.linux))).toBe(false);
    expect(isStandalone(fakeWin(UA.linux, { displayStandalone: true }))).toBe(true);
    expect(isStandalone(fakeWin(UA.iphone, { standalone: true }))).toBe(true);
  });
});

describe('initInstallBanner', () => {
  it('aucune bannière dans Tauri', () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    initInstallBanner(fakeWin(UA.windows));
    expect(el('install').hidden).toBe(true);
  });

  it('aucune bannière si déjà installée (standalone)', () => {
    initInstallBanner(fakeWin(UA.windows, { displayStandalone: true }));
    expect(el('install').hidden).toBe(true);
    initInstallBanner(fakeWin(UA.iphone, { standalone: true }));
    expect(el('install').hidden).toBe(true);
  });

  it('Windows et Android : lien natif, pas de bouton Installer', () => {
    for (const ua of [UA.windows, UA.android]) {
      document.getElementById('install')?.setAttribute('hidden', '');
      const win = fakeWin(ua);
      const add = vi.spyOn(win, 'addEventListener');
      initInstallBanner(win);
      expect(el('install').hidden).toBe(false);
      expect(el('install-text').dataset.i18n).toBe('install.native');
      const link = /** @type {HTMLAnchorElement} */ (el('install-native'));
      expect(link.hidden).toBe(false);
      expect(link.getAttribute('href')).toBe(NATIVE_URL);
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
      expect(el('install-accept').hidden).toBe(true);
      expect(add).not.toHaveBeenCalledWith('beforeinstallprompt', expect.anything());
    }
  });

  it('iOS : instructions, pas de bouton Installer', () => {
    initInstallBanner(fakeWin(UA.iphone));
    expect(el('install').hidden).toBe(false);
    expect(el('install-text').dataset.i18n).toBe('install.ios');
    expect(el('install-keys').hidden).toBe(false);
    expect(el('install-accept').hidden).toBe(true);
    expect(el('install-native').hidden).toBe(true);
  });

  it('Safari sur Mac : instructions Ajouter au Dock', () => {
    initInstallBanner(fakeWin(UA.macSafari));
    expect(el('install').hidden).toBe(false);
    expect(el('install-text').dataset.i18n).toBe('install.mac');
    expect(el('install-keys').hidden).toBe(true);
  });

  it('Chromium sur Mac/Linux : bouton Installer affiché seulement après beforeinstallprompt, clic → prompt()', async () => {
    initInstallBanner(fakeWin(UA.linux));
    expect(el('install').hidden).toBe(true);
    expect(el('install-accept').hidden).toBe(true);

    const event = installEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(el('install').hidden).toBe(false);
    expect(el('install-accept').hidden).toBe(false);
    expect(el('install-keys').hidden).toBe(true);

    el('install-accept').click();
    await Promise.resolve();
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(el('install').hidden).toBe(true);
  });

  it('Chrome sur Mac passe par beforeinstallprompt', () => {
    initInstallBanner(fakeWin(UA.macChrome));
    expect(el('install').hidden).toBe(true);
    window.dispatchEvent(installEvent());
    expect(el('install-accept').hidden).toBe(false);
  });

  it("l'événement appinstalled masque la bannière (installation faite via le navigateur)", () => {
    initInstallBanner(fakeWin(UA.linux));
    window.dispatchEvent(installEvent());
    expect(el('install').hidden).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));

    expect(el('install').hidden).toBe(true);
  });

  it('un prompt() qui échoue ne lève pas', async () => {
    initInstallBanner(fakeWin(UA.linux));
    const event = installEvent();
    event.prompt.mockRejectedValue(new Error('déjà utilisé'));
    window.dispatchEvent(event);

    el('install-accept').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(el('install').hidden).toBe(true);
  });

  it('après « Plus tard », un beforeinstallprompt tardif ne réaffiche rien', () => {
    localStorage.setItem('ponto-install-dismissed', '1');
    initInstallBanner(fakeWin(UA.linux));

    window.dispatchEvent(installEvent());

    expect(el('install').hidden).toBe(true);
    expect(el('install-accept').hidden).toBe(true);
  });

  it('« Plus tard » masque et mémorise ; localStorage qui lève → pas d\'exception', () => {
    initInstallBanner(fakeWin(UA.iphone));
    el('install-later').click();
    expect(el('install').hidden).toBe(true);
    expect(localStorage.getItem('ponto-install-dismissed')).toBe('1');

    initInstallBanner(fakeWin(UA.iphone));
    expect(el('install').hidden).toBe(true);

    localStorage.clear();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const win = fakeWin(UA.iphone);
    Object.defineProperty(win, 'localStorage', {
      get() {
        return localStorage;
      },
    });
    expect(() => initInstallBanner(win)).not.toThrow();
    expect(el('install').hidden).toBe(false);
    expect(() => el('install-later').click()).not.toThrow();
    expect(el('install').hidden).toBe(true);
  });
});
