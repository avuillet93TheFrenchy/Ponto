import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_STORE, loadSettings, saveSetting } from '@js/settings.js';

const mocks = vi.hoisted(() => ({ storeGet: vi.fn(), storeSet: vi.fn() }));

vi.mock('@tauri/index.js', () => ({ storeGet: mocks.storeGet, storeSet: mocks.storeSet }));

beforeEach(() => {
  vi.resetAllMocks();
});

/** @param {Record<string, unknown>} stored - Content of the Store, by key. */
const storeWith = (stored) =>
  mocks.storeGet.mockImplementation(async (/** @type {string} */ _store, /** @type {string} */ key) => stored[key] ?? null);

describe('loadSettings', () => {
  it('renvoie les valeurs par défaut quand le Store est vide', async () => {
    mocks.storeGet.mockResolvedValue(null);

    expect(await loadSettings()).toEqual({
      deeplKey: '',
      laraId: '',
      laraSecret: '',
      autoTranslate: false,
      provider: 'deepl',
      sourceLang: 'en',
      targetLang: 'fr',
      formal: true,
      history: [],
      recentLangs: { source: [], target: [] },
      languageCache: { fetchedAt: 0, deepl: null, lara: null },
      voices: {},
      uiLang: 'en',
    });
    expect(mocks.storeGet).toHaveBeenCalledWith('settings.json', 'deeplKey');
  });

  it('garde les valeurs enregistrées, y compris false et chaîne vide', async () => {
    storeWith({ provider: 'both', formal: false, laraId: '' });

    const settings = await loadSettings();

    expect(settings.provider).toBe('both');
    expect(settings.formal).toBe(false);
    expect(settings.laraId).toBe('');
    expect(settings.sourceLang).toBe('en');
  });
});

describe('langue de l’interface', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('suit la langue du système quand rien n’est enregistré : français pour fr*, anglais sinon', async () => {
    mocks.storeGet.mockResolvedValue(null);

    vi.stubGlobal('navigator', { language: 'fr-CA' });
    expect((await loadSettings()).uiLang).toBe('fr');

    vi.stubGlobal('navigator', { language: 'ja-JP' });
    expect((await loadSettings()).uiLang).toBe('en');
  });

  it('garde la langue enregistrée, même si elle diffère de celle du système', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    storeWith({ uiLang: 'en' });

    expect((await loadSettings()).uiLang).toBe('en');
  });

  it('ignore une langue enregistrée inconnue', async () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });
    storeWith({ uiLang: 'de' });

    expect((await loadSettings()).uiLang).toBe('fr');
  });
});

describe('migration de l’ancien format', () => {
  it('convertit direction en paire source / cible et l’enregistre', async () => {
    storeWith({ direction: 'fr-en' });
    mocks.storeSet.mockResolvedValue(undefined);

    const settings = await loadSettings();

    expect(settings).toMatchObject({ sourceLang: 'fr', targetLang: 'en-US' });
    expect(settings).not.toHaveProperty('direction');
    expect(mocks.storeSet).toHaveBeenCalledWith(SETTINGS_STORE, 'sourceLang', 'fr');
    expect(mocks.storeSet).toHaveBeenCalledWith(SETTINGS_STORE, 'targetLang', 'en-US');
  });

  it('ignore direction quand la paire est déjà enregistrée', async () => {
    storeWith({ direction: 'fr-en', sourceLang: 'ja', targetLang: 'ko' });

    expect(await loadSettings()).toMatchObject({ sourceLang: 'ja', targetLang: 'ko' });
    expect(mocks.storeSet).not.toHaveBeenCalled();
  });

  it("convertit les entrées d'historique et les enregistre", async () => {
    storeWith({
      history: [
        { engine: 'deepl', direction: 'en-fr', src: 'Hi', dst: 'Salut' },
        { engine: 'lara', source: 'ja', target: 'ko', src: 'a', dst: 'b' },
      ],
    });
    mocks.storeSet.mockResolvedValue(undefined);

    const { history } = await loadSettings();

    expect(history).toEqual([
      { engine: 'deepl', source: 'en', target: 'fr', src: 'Hi', dst: 'Salut' },
      { engine: 'lara', source: 'ja', target: 'ko', src: 'a', dst: 'b' },
    ]);
    expect(mocks.storeSet).toHaveBeenCalledWith(SETTINGS_STORE, 'history', history);
  });

  it('renvoie des objets par défaut indépendants à chaque lecture', async () => {
    mocks.storeGet.mockResolvedValue(null);

    const first = await loadSettings();
    first.recentLangs.source.push('ja');

    expect((await loadSettings()).recentLangs.source).toEqual([]);
  });
});

describe('saveSetting', () => {
  it('écrit la valeur dans le Store des réglages', async () => {
    mocks.storeSet.mockResolvedValue(undefined);

    await saveSetting('provider', 'lara');

    expect(mocks.storeSet).toHaveBeenCalledWith(SETTINGS_STORE, 'provider', 'lara');
  });
});
