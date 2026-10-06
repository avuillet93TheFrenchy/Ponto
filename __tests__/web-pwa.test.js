import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri/index.js', () => ({ isTauriRuntime: vi.fn() }));

const { isTauriRuntime } = await import('@tauri/index.js');
const { registerServiceWorker, watchForUpdates } = await import('../src/js/web/pwa.js');

/**
 * A fake ServiceWorkerRegistration.
 * @returns {EventTarget & { waiting: any, installing: any, update: import('vitest').Mock }}
 */
function fakeRegistration() {
  return Object.assign(new EventTarget(), {
    waiting: null,
    installing: null,
    update: vi.fn().mockResolvedValue(undefined),
  });
}

/**
 * A fake ServiceWorker.
 * @param {string} state
 * @returns {EventTarget & { state: string, postMessage: import('vitest').Mock }}
 */
function fakeWorker(state) {
  return Object.assign(new EventTarget(), { state, postMessage: vi.fn() });
}

/** @type {import('vitest').Mock} */
let register;
/** @type {EventTarget & { register: import('vitest').Mock, controller: object | null }} */
let container;
/** @type {ReturnType<typeof fakeRegistration>} */
let registration;

/** @param {string} id */
const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @type {EventListenerOrEventListenerObject[]} Listeners that watchForUpdates put on `document`. */
let documentListeners = [];

beforeEach(() => {
  // Listeners on `document` outlive a test; remove them so one test cannot trigger another's fakes.
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'visibilitychange') documentListeners.push(/** @type {EventListener} */ (listener));
    add(type, listener, options);
  });
  registration = fakeRegistration();
  register = vi.fn().mockResolvedValue(registration);
  container = Object.assign(new EventTarget(), { register, controller: null });
  vi.mocked(isTauriRuntime).mockReturnValue(false);
  vi.stubEnv('MODE', 'web');
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  document.body.innerHTML = `
    <aside id="update" hidden>
      <button id="update-accept" type="button">Mettre à jour</button>
      <button id="update-later" type="button">Plus tard</button>
    </aside>`;
});

afterEach(() => {
  for (const listener of documentListeners) document.removeEventListener('visibilitychange', listener);
  documentListeners = [];
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('registerServiceWorker', () => {
  it('registerServiceWorker enregistre /sw.js en mode web hors Tauri', async () => {
    await registerServiceWorker();
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('ne fait rien dans Tauri', async () => {
    vi.mocked(isTauriRuntime).mockReturnValue(true);
    await registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });

  it('ne fait rien hors mode web', async () => {
    vi.stubEnv('MODE', 'production');
    await registerServiceWorker();
    expect(register).not.toHaveBeenCalled();
  });

  it('ne fait rien sans support du service worker', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    await expect(registerServiceWorker()).resolves.toBeUndefined();
    expect(register).not.toHaveBeenCalled();
  });

  it('une erreur d\'enregistrement ne lève pas', async () => {
    register.mockRejectedValue(new Error('boom'));
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });

  it('surveille les mises à jour de la registration obtenue', async () => {
    container.controller = {};
    registration.waiting = fakeWorker('installed');
    await registerServiceWorker();
    expect(el('update').hidden).toBe(false);
  });
});

describe('mise à jour du service worker', () => {
  it('propose la mise à jour quand une nouvelle version attend déjà', () => {
    container.controller = {};
    registration.waiting = fakeWorker('installed');
    watchForUpdates(/** @type {any} */ (registration));
    expect(el('update').hidden).toBe(false);
  });

  it('ne propose rien tant qu\'aucune nouvelle version n\'attend', () => {
    container.controller = {};
    watchForUpdates(/** @type {any} */ (registration));
    expect(el('update').hidden).toBe(true);
  });

  it('propose la mise à jour quand le nouveau service worker finit de s\'installer', () => {
    container.controller = {};
    watchForUpdates(/** @type {any} */ (registration));
    const worker = fakeWorker('installing');
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    expect(el('update').hidden).toBe(true);

    worker.state = 'installed';
    registration.waiting = worker;
    worker.dispatchEvent(new Event('statechange'));
    expect(el('update').hidden).toBe(false);
  });

  it('ne propose rien à la toute première installation (pas de contrôleur)', () => {
    watchForUpdates(/** @type {any} */ (registration));
    const worker = fakeWorker('installing');
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    worker.state = 'installed';
    registration.waiting = worker;
    worker.dispatchEvent(new Event('statechange'));
    expect(el('update').hidden).toBe(true);
  });

  it('« Mettre à jour » active la nouvelle version puis recharge une seule fois', () => {
    container.controller = {};
    const waiting = fakeWorker('installed');
    registration.waiting = waiting;
    const reload = vi.fn();
    watchForUpdates(/** @type {any} */ (registration), reload);

    el('update-accept').click();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();

    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sans clic, un changement de contrôleur venu d\'un autre onglet ne recharge pas la page', () => {
    container.controller = {};
    registration.waiting = fakeWorker('installed');
    const reload = vi.fn();
    watchForUpdates(/** @type {any} */ (registration), reload);

    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('« Plus tard » masque la bannière', () => {
    container.controller = {};
    registration.waiting = fakeWorker('installed');
    watchForUpdates(/** @type {any} */ (registration));

    el('update-later').click();
    expect(el('update').hidden).toBe(true);
  });

  it('cherche une nouvelle version quand la page revient au premier plan', () => {
    watchForUpdates(/** @type {any} */ (registration));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('une vérification de mise à jour qui échoue (hors ligne) ne lève pas', async () => {
    registration.update.mockRejectedValue(new TypeError('Failed to fetch'));
    watchForUpdates(/** @type {any} */ (registration));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registration.update).toHaveBeenCalled();
  });

  it('ne fait rien si la bannière est absente de la page', () => {
    document.body.innerHTML = '';
    container.controller = {};
    registration.waiting = fakeWorker('installed');
    expect(() => watchForUpdates(/** @type {any} */ (registration))).not.toThrow();
  });
});

describe('icônes PWA', () => {
  it('les PNG PWA existent avec les dimensions annoncées', () => {
    /** @type {[string, number][]} */
    const expected = [
      ['pwa-192.png', 192],
      ['pwa-512.png', 512],
      ['pwa-maskable-512.png', 512],
      ['apple-touch-icon.png', 180],
    ];
    for (const [file, size] of expected) {
      const png = readFileSync(join(process.cwd(), 'public-web', file));
      expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });
});
