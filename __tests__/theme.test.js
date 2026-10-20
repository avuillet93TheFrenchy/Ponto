import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * @typedef {object} FakeMedia
 * @property {boolean} matches
 * @property {(type: string, listener: () => void) => void} addEventListener
 * @property {(dark: boolean) => void} change - Flips `matches` and notifies the `change` listeners.
 */

/** @type {FakeMedia} */
let media;
/** @type {HTMLButtonElement} */
let button;

/** @param {{ systemDark?: boolean, stored?: string | null }} [options] */
async function init({ systemDark = false, stored = null } = {}) {
  /** @type {(() => void)[]} */
  const listeners = [];
  media = {
    matches: systemDark,
    addEventListener: (type, listener) => {
      if (type === 'change') listeners.push(listener);
    },
    change(dark) {
      this.matches = dark;
      for (const listener of listeners) listener();
    },
  };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  if (stored !== null) localStorage.setItem('color-scheme', stored);

  vi.resetModules();
  const { initThemeToggle } = await import('@js/theme.js');
  button = document.createElement('button');
  initThemeToggle(button);
}

const meta = () => /** @type {HTMLMetaElement} */ (document.querySelector('meta[name="color-scheme"]'));
const rootClasses = () => [...document.documentElement.classList];

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = '';
  const tag = document.createElement('meta');
  tag.name = 'color-scheme';
  tag.content = 'light dark';
  document.head.replaceChildren(tag);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('état initial', () => {
  it('suit le système clair et propose le thème sombre', async () => {
    await init();

    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.title).toBe('Passer en thème sombre');
  });

  it('suit le système sombre et propose le thème clair', async () => {
    await init({ systemDark: true });

    expect(button.title).toBe('Passer en thème clair');
  });

  it('reprend un thème forcé enregistré', async () => {
    await init({ stored: 'light', systemDark: true });

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.title).toBe('Revenir au thème du système');
  });

  it('ignore une valeur enregistrée inconnue', async () => {
    await init({ stored: 'sepia' });

    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('clic sur le bouton', () => {
  it("force le thème opposé à celui du système et l'enregistre", async () => {
    await init();

    button.click();

    expect(localStorage.getItem('color-scheme')).toBe('dark');
    expect(rootClasses()).toEqual(['dark']);
    expect(meta().content).toBe('dark');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.title).toBe('Revenir au thème du système');
  });

  it('force le thème clair quand le système est sombre', async () => {
    await init({ systemDark: true });

    button.click();

    expect(localStorage.getItem('color-scheme')).toBe('light');
    expect(rootClasses()).toEqual(['light']);
  });

  it('revient au thème du système au second clic', async () => {
    await init();

    button.click();
    button.click();

    expect(localStorage.getItem('color-scheme')).toBeNull();
    expect(rootClasses()).toEqual([]);
    expect(meta().content).toBe('light dark');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.title).toBe('Passer en thème sombre');
  });
});

describe('changement du thème système', () => {
  it('met à jour le libellé du bouton', async () => {
    await init();

    media.change(true);

    expect(button.title).toBe('Passer en thème clair');
  });

  it('garde le thème forcé', async () => {
    await init();
    button.click();

    media.change(true);

    expect(rootClasses()).toEqual(['dark']);
    expect(button.title).toBe('Revenir au thème du système');
  });
});

describe('stockage indisponible', () => {
  it('suit le système et applique quand même le thème pour la session', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await init();

    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();

    expect(rootClasses()).toEqual(['dark']);
    expect(meta().content).toBe('dark');
  });
});
