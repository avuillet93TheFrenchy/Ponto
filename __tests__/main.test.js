import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTS } from './fixtures/languages.js';

const mocks = vi.hoisted(() => ({
  tauriInvoke: vi.fn(),
  logError: vi.fn(),
  loadSettings: vi.fn(),
  saveSetting: vi.fn(),
  initThemeToggle: vi.fn(),
  isTauriRuntime: vi.fn(),
  vaultClear: vi.fn(),
  initInstallBanner: vi.fn(),
  /** @type {(() => void)[]} */
  unsubscribers: [],
}));

vi.mock('@tauri/index.js', () => ({
  tauriInvoke: mocks.tauriInvoke,
  logError: mocks.logError,
  isTauriRuntime: mocks.isTauriRuntime,
  // Only reached by the real settings.js (setUiLanguage persists the language itself).
  storeGet: vi.fn(),
  storeSet: vi.fn(),
}));
// Real i18n (t, applyTranslations, setUiLanguage…), so the tests read the French texts users see;
// only the Store-backed functions are replaced.
// settings.js is created once per file (vi.resetModules does not rebuild mock factories) and keeps
// its language-change listeners in a module-level Set. Each boot registers `refreshUi` there, so
// the listeners are removed after every test: an old main.js instance must not react to a later one.
vi.mock('@js/settings.js', async () => {
  const actual = /** @type {typeof import('@js/settings.js')} */ (await vi.importActual('@js/settings.js'));
  return {
    ...actual,
    onUiLanguageChange: (/** @type {(lang: 'fr' | 'en') => void} */ listener) => {
      const off = actual.onUiLanguageChange(listener);
      mocks.unsubscribers.push(off);
      return off;
    },
    loadSettings: mocks.loadSettings,
    saveSetting: mocks.saveSetting,
  };
});
vi.mock('@js/web/vault.js', () => ({ vaultClear: mocks.vaultClear }));
vi.mock('@js/web/install.js', () => ({ initInstallBanner: mocks.initInstallBanner }));
vi.mock('@js/theme.js', () => ({ initThemeToggle: mocks.initThemeToggle }));

const DEFAULT_SETTINGS = {
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
  languageCache: { fetchedAt: Date.now(), ...LISTS },
  voices: {},
  uiLang: 'fr',
};

const indexHtml = readFileSync(join(import.meta.dirname, '..', 'index.html'), 'utf8');

// The helpers return `any`: the tests read properties of many element types (`value`,
// `open`, `disabled`, `returnValue`…) that a single DOM type cannot express.

/**
 * @param {string} id
 * @returns {any}
 */
const $ = (id) => document.getElementById(id);

/**
 * @param {string} engine
 * @returns {any}
 */
const row = (engine) => document.querySelector(`.engine-tag[data-engine="${engine}"]`)?.closest('.row');

/**
 * @param {string} engine
 * @param {string} selector
 * @returns {any}
 */
const inRow = (engine, selector) => row(engine).querySelector(selector);

const engineTags = () => [...document.querySelectorAll('#panes .engine-tag')].map((t) => t.textContent);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * @template [T=unknown]
 * @returns {{ promise: Promise<T>, resolve: (value: T) => void, reject: (reason?: unknown) => void }}
 */
function deferred() {
  /** @type {(value: T) => void} */
  let resolve = () => {};
  /** @type {(reason?: unknown) => void} */
  let reject = () => {};
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * @param {string} engine
 * @param {string} text
 */
function type(engine, text) {
  const source = inRow(engine, '.source');
  source.value = text;
  source.dispatchEvent(new Event('input'));
}

/** @param {string} engine */
async function translateRow(engine) {
  inRow(engine, '.translate-one').click();
  await flush();
}

/** @param {string} key */
function lastSaved(key) {
  const calls = mocks.saveSetting.mock.calls.filter(([k]) => k === key);
  return calls.at(-1)?.[1];
}

async function boot(settings = {}) {
  mocks.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings });
  vi.resetModules();
  await import('../src/main.js');
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(returnValue) {
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.saveSetting.mockResolvedValue(undefined);
  mocks.logError.mockResolvedValue(undefined);
  mocks.isTauriRuntime.mockReturnValue(true);
  mocks.vaultClear.mockResolvedValue(undefined);
  const page = new DOMParser().parseFromString(indexHtml, 'text/html');
  document.body.replaceWith(document.importNode(page.body, true));
});

afterEach(() => {
  for (const off of mocks.unsubscribers.splice(0)) off();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  // main.js decides once, at import, whether speech synthesis exists (`'speechSynthesis' in window`):
  // a stub left on `window` by an earlier test would make later imports expect it as a global.
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
});

describe('démarrage', () => {
  it("prépare l'invitation d'installation avant le chargement réseau des langues", async () => {
    // beforeinstallprompt can fire while the language lists are still loading: the listener must exist by then.
    mocks.tauriInvoke.mockReturnValue(new Promise(() => {}));
    mocks.loadSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      languageCache: { fetchedAt: 0, deepl: null, lara: null },
    });
    vi.resetModules();
    void import('../src/main.js');
    // The language lists are loading (and never finish here).
    await vi.waitFor(() => expect(mocks.tauriInvoke).toHaveBeenCalled(), { timeout: 15000 });
    expect(mocks.initInstallBanner).toHaveBeenCalledTimes(1);
  });

  it('affiche une seule ligne DeepL avec les réglages par défaut', async () => {
    await boot();

    expect(engineTags()).toEqual(['DeepL']);
    expect($('panes').dataset.mode).toBe('deepl');
    expect(inRow('deepl', '.engine-badge').textContent).toBe('Traduit avec DeepL');
    expect(inRow('deepl', '.source').id).toBe('source-deepl');
    expect(inRow('deepl', '.source').getAttribute('aria-label')).toBe('Texte source');
    expect(inRow('deepl', '.count').textContent).toMatch(/^0 \/ 10\s000$/);
    expect($('translate-all-label').textContent).toBe('Traduire');
    expect($('src-lang').textContent).toBe('Anglais');
    expect($('dst-lang').textContent).toBe('Français');
    expect($('formality').hidden).toBe(false);
  });

  it('applique les réglages sauvegardés', async () => {
    await boot({ provider: 'both', sourceLang: 'fr', targetLang: 'en-US', formal: false });

    expect(engineTags()).toEqual(['DeepL', 'Lara']);
    expect($('translate-all-label').textContent).toBe('Traduire avec les deux');
    expect($('src-lang').textContent).toBe('Français');
    expect($('dst-lang').textContent).toBe('Anglais (États-Unis)');
    // DeepL ignores the formality for en-US, but Lara still receives it as an instruction.
    expect($('formality').hidden).toBe(false);
    expect($('provider').querySelector('[data-value="both"]').getAttribute('aria-pressed')).toBe('true');
    expect($('provider').querySelector('[data-value="deepl"]').getAttribute('aria-pressed')).toBe('false');
    expect($('formality').querySelector('[data-value="false"]').getAttribute('aria-pressed')).toBe('true');
  });

  it("n'affiche que les trois entrées d'historique les plus récentes", async () => {
    const history = [
      { engine: 'lara', source: 'en', target: 'fr', src: 'one', dst: 'un' },
      { engine: 'deepl', source: 'en', target: 'fr', src: 'two', dst: 'deux' },
      { engine: 'deepl', source: 'en', target: 'fr', src: 'three', dst: 'trois' },
      { engine: 'deepl', source: 'en', target: 'fr', src: 'four', dst: 'quatre' },
    ];
    await boot({ history });

    const buttons = [...$('history').querySelectorAll('button')];
    expect(buttons).toHaveLength(3);
    expect(buttons[0].title).toBe('Lara : one\n→ un');
    expect(buttons[0].querySelector('.tag').textContent).toBe('L');
    expect(buttons[0].querySelector('.tag').dataset.engine).toBe('lara');
    expect(buttons[1].textContent).toBe('Dtwo → deux');
  });

  it('garde les valeurs par défaut et journalise si la lecture des réglages échoue', async () => {
    mocks.loadSettings.mockRejectedValue(new Error('store cassé'));
    vi.resetModules();
    await import('../src/main.js');

    expect(mocks.logError).toHaveBeenCalledWith('Lecture des paramètres impossible : Error: store cassé');
    expect(engineTags()).toEqual(['DeepL']);
  });

  it('branche le bouton de thème', async () => {
    await boot();

    expect(mocks.initThemeToggle).toHaveBeenCalledWith($('theme-toggle'));
  });

  it("masque le bouton Écouter quand la synthèse vocale n'existe pas", async () => {
    await boot();

    expect(inRow('deepl', '.speak').hidden).toBe(true);
  });
});

describe('traduction', () => {
  it('envoie le texte nettoyé à la commande Rust et affiche le résultat', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();

    type('deepl', '  Hello  ');
    await translateRow('deepl');

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_deepl', {
      text: 'Hello',
      source: 'EN',
      target: 'FR',
      formal: true,
    });
    expect(inRow('deepl', '.target').textContent).toBe('Bonjour');
    expect(inRow('deepl', '.target').dataset.state).toBeUndefined();
  });

  it('marque la ligne comme en chargement pendant la requête', async () => {
    const pending = deferred();
    mocks.tauriInvoke.mockReturnValue(pending.promise);
    await boot();

    type('deepl', 'Hello');
    inRow('deepl', '.translate-one').click();
    expect(inRow('deepl', '.target').dataset.state).toBe('loading');

    pending.resolve('Bonjour');
    await flush();
    expect(inRow('deepl', '.target').dataset.state).toBeUndefined();
  });

  it("n'appelle pas l'API pour un texte vide", async () => {
    await boot();

    type('deepl', '   ');
    await translateRow('deepl');

    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
    expect(inRow('deepl', '.target').textContent).toBe('');
  });

  it("refuse un texte de plus de 10 000 caractères sans appeler l'API", async () => {
    await boot();

    type('deepl', 'a'.repeat(10001));
    await translateRow('deepl');

    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
    expect(inRow('deepl', '.target').textContent).toMatch(/^Texte trop long : 10\s000 caractères maximum\.$/);
    expect(inRow('deepl', '.target').dataset.state).toBe('error');
  });

  it("affiche et journalise le message d'erreur renvoyé par Rust", async () => {
    mocks.tauriInvoke.mockRejectedValue({ cause: 'Quota dépassé' });
    await boot();

    type('deepl', 'Hello');
    await translateRow('deepl');

    expect(inRow('deepl', '.target').textContent).toBe('Quota dépassé');
    expect(inRow('deepl', '.target').dataset.state).toBe('error');
    expect(mocks.logError).toHaveBeenCalledWith('Échec de traduction (deepl) : Quota dépassé');
    expect($('settings').open).toBe(false);
  });

  it("affiche un message générique quand l'erreur n'a pas de cause", async () => {
    mocks.tauriInvoke.mockRejectedValue(new Error('boom'));
    await boot();

    type('deepl', 'Hello');
    await translateRow('deepl');

    expect(inRow('deepl', '.target').textContent).toBe('Une erreur est survenue.');
  });

  it('ouvre les Paramètres quand la clé API manque', async () => {
    mocks.tauriInvoke.mockRejectedValue({ cause: 'Clé API DeepL manquante. Ajoute-la dans les Paramètres.' });
    await boot();

    type('deepl', 'Hello');
    await translateRow('deepl');
    await flush();

    expect($('settings').open).toBe(true);
    // The Rust text is replaced by the translated message, addressed with « vous ».
    expect(inRow('deepl', '.target').textContent).toBe('Clé API DeepL manquante. Ajoutez-la dans les Paramètres.');
  });

  it('ignore une réponse arrivée après une requête plus récente', async () => {
    const first = deferred();
    const second = deferred();
    mocks.tauriInvoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await boot();

    type('deepl', 'first');
    inRow('deepl', '.translate-one').click();
    type('deepl', 'second');
    inRow('deepl', '.translate-one').click();

    second.resolve('deuxième');
    await flush();
    first.resolve('premier');
    await flush();

    expect(inRow('deepl', '.target').textContent).toBe('deuxième');
    expect(lastSaved('history')).toEqual([
      { engine: 'deepl', source: 'en', target: 'fr', src: 'second', dst: 'deuxième' },
    ]);
  });

  it('ignore une erreur arrivée après une requête plus récente', async () => {
    const first = deferred();
    mocks.tauriInvoke.mockReturnValueOnce(first.promise).mockResolvedValueOnce('deuxième');
    await boot();

    type('deepl', 'first');
    inRow('deepl', '.translate-one').click();
    type('deepl', 'second');
    await translateRow('deepl');
    first.reject({ cause: 'trop tard' });
    await flush();

    expect(inRow('deepl', '.target').textContent).toBe('deuxième');
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it('traduit tous les moteurs visibles et désactive le bouton pendant ce temps', async () => {
    const pending = deferred();
    mocks.tauriInvoke.mockReturnValue(pending.promise);
    await boot({ provider: 'both' });

    type('deepl', 'Hello');
    type('lara', 'Hi');
    $('translate-all').click();

    expect($('translate-all').disabled).toBe(true);
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_deepl', expect.objectContaining({ text: 'Hello' }));
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_lara', expect.objectContaining({ text: 'Hi' }));

    pending.resolve('Salut');
    await flush();
    expect($('translate-all').disabled).toBe(false);
  });

  it('traduit tout avec Ctrl+Entrée, mais pas avec Entrée seule', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();
    type('deepl', 'Hello');
    const source = inRow('deepl', '.source');

    source.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(mocks.tauriInvoke).not.toHaveBeenCalled();

    const ctrlEnter = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, cancelable: true });
    source.dispatchEvent(ctrlEnter);
    await flush();

    expect(ctrlEnter.defaultPrevented).toBe(true);
    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
    expect(inRow('deepl', '.target').textContent).toBe('Bonjour');
  });

  it('met à jour le compteur et signale le dépassement', async () => {
    await boot();

    type('deepl', 'Hello');
    expect(inRow('deepl', '.count').textContent).toMatch(/^5 \/ 10\s000$/);
    expect(inRow('deepl', '.count').dataset.over).toBe('false');

    type('deepl', 'a'.repeat(10001));
    expect(inRow('deepl', '.count').dataset.over).toBe('true');
  });
});

describe('traduction automatique', () => {
  it('traduit une seule fois, 700 ms après la dernière frappe', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ autoTranslate: true });
    vi.useFakeTimers();

    type('deepl', 'Hel');
    await vi.advanceTimersByTimeAsync(500);
    type('deepl', 'Hello');
    await vi.advanceTimersByTimeAsync(699);
    expect(mocks.tauriInvoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_deepl', expect.objectContaining({ text: 'Hello' }));
  });

  it("termine la traduction d'un moteur masqué entre-temps et l'affiche quand il revient", async () => {
    mocks.tauriInvoke.mockResolvedValue('Salut');
    await boot({ provider: 'both', autoTranslate: true });
    vi.useFakeTimers();

    type('lara', 'Hi');
    $('provider').querySelector('[data-value="deepl"]').click();
    await vi.advanceTimersByTimeAsync(700);

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_lara', expect.objectContaining({ text: 'Hi' }));
    expect(engineTags()).toEqual(['DeepL']);

    $('provider').querySelector('[data-value="both"]').click();
    expect(inRow('lara', '.target').textContent).toBe('Salut');
  });

  it('ne traduit rien pendant la saisie quand elle est désactivée', async () => {
    await boot();
    vi.useFakeTimers();

    type('deepl', 'Hello');
    await vi.advanceTimersByTimeAsync(2000);

    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
  });
});

describe('effacer', () => {
  it('vide la ligne, remet le focus sur la source et ignore la réponse en cours', async () => {
    const pending = deferred();
    mocks.tauriInvoke.mockReturnValue(pending.promise);
    await boot();

    type('deepl', 'Hello');
    inRow('deepl', '.translate-one').click();
    inRow('deepl', '.clear').click();
    pending.resolve('Bonjour');
    await flush();

    expect(inRow('deepl', '.source').value).toBe('');
    expect(inRow('deepl', '.target').textContent).toBe('');
    expect(inRow('deepl', '.count').textContent).toMatch(/^0 \//);
    expect(document.activeElement).toBe(inRow('deepl', '.source'));
  });
});

describe('choix du moteur', () => {
  it('passe à Lara et enregistre le choix', async () => {
    await boot();

    $('provider').querySelector('[data-value="lara"]').click();

    expect(engineTags()).toEqual(['Lara']);
    expect(mocks.saveSetting).toHaveBeenCalledWith('provider', 'lara');
    expect($('provider').querySelector('[data-value="lara"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('ne fait rien quand on reclique sur le moteur actif', async () => {
    await boot();

    $('provider').querySelector('[data-value="deepl"]').click();

    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });

  it('ignore un clic hors des boutons', async () => {
    await boot();

    $('provider').click();

    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });

  it('recopie le texte de DeepL dans la ligne Lara en passant à « Les deux »', async () => {
    await boot();
    type('deepl', 'Hello');

    $('provider').querySelector('[data-value="both"]').click();

    expect(inRow('lara', '.source').value).toBe('Hello');
    expect(inRow('deepl', '.source').value).toBe('Hello');
  });

  it('recopie le texte de Lara dans la ligne DeepL en passant à « Les deux »', async () => {
    await boot({ provider: 'lara' });
    type('lara', 'Hi');

    $('provider').querySelector('[data-value="both"]').click();

    expect(inRow('deepl', '.source').value).toBe('Hi');
  });

  it("n'écrase pas un texte déjà présent dans l'autre ligne", async () => {
    await boot({ provider: 'both' });
    type('deepl', 'Hello');
    type('lara', 'Hi');

    $('provider').querySelector('[data-value="deepl"]').click();
    $('provider').querySelector('[data-value="both"]').click();

    expect(inRow('lara', '.source').value).toBe('Hi');
  });
});

describe('inversion des langues', () => {
  it('inverse le sens, enregistre et masque le choix Vous / Tu', async () => {
    await boot();

    $('swap').click();

    expect(mocks.saveSetting).toHaveBeenCalledWith('sourceLang', 'fr');
    expect(mocks.saveSetting).toHaveBeenCalledWith('targetLang', 'en-US');
    expect($('src-lang').textContent).toBe('Français');
    expect($('dst-lang').textContent).toBe('Anglais (États-Unis)');
    expect($('formality').hidden).toBe(true);
  });

  it("fait de la traduction le nouveau texte source, sans rappeler l'API", async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();
    type('deepl', 'Hello');
    await translateRow('deepl');

    $('swap').click();

    expect(inRow('deepl', '.source').value).toBe('Bonjour');
    expect(inRow('deepl', '.target').textContent).toBe('Hello');
    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
  });

  it("garde le texte source tant qu'il n'y a pas de traduction", async () => {
    await boot();
    type('deepl', 'Hello');

    $('swap').click();
    $('swap').click();

    expect(inRow('deepl', '.source').value).toBe('Hello');
    expect(lastSaved('sourceLang')).toBe('en');
    expect(lastSaved('targetLang')).toBe('fr');
  });
});

describe('formalité', () => {
  it('passe au tutoiement et retraduit ce qui était déjà traduit', async () => {
    mocks.tauriInvoke.mockResolvedValueOnce('Pouvez-vous ?').mockResolvedValueOnce('Peux-tu ?');
    await boot({ provider: 'both' });
    type('deepl', 'Can you?');
    await translateRow('deepl');

    $('formality').querySelector('[data-value="false"]').click();
    await flush();

    expect(mocks.saveSetting).toHaveBeenCalledWith('formal', false);
    expect($('formality').querySelector('[data-value="false"]').getAttribute('aria-pressed')).toBe('true');
    // Lara n'avait rien traduit : seul DeepL est rappelé.
    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(2);
    expect(mocks.tauriInvoke).toHaveBeenLastCalledWith('translate_deepl', expect.objectContaining({ formal: false }));
    expect(inRow('deepl', '.target').textContent).toBe('Peux-tu ?');
  });

  it('ne fait rien quand on reclique sur la formalité active', async () => {
    await boot();

    $('formality').querySelector('[data-value="true"]').click();

    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });

  it('ignore un clic hors des boutons', async () => {
    await boot();

    $('formality').click();

    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });
});

describe('historique', () => {
  it('ajoute chaque traduction en tête et remplace un doublon', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    const older = { engine: 'lara', source: 'en', target: 'fr', src: 'Hi', dst: 'Salut' };
    await boot({ history: [older] });

    type('deepl', 'Hello');
    await translateRow('deepl');
    await translateRow('deepl');

    const entry = { engine: 'deepl', source: 'en', target: 'fr', src: 'Hello', dst: 'Bonjour' };
    expect(lastSaved('history')).toEqual([entry, older]);
    expect($('history').querySelectorAll('button')).toHaveLength(2);
  });

  it('garde au plus 20 entrées', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    const history = Array.from({ length: 20 }, (_, i) => ({
      engine: 'deepl',
      source: 'en',
      target: 'fr',
      src: `text ${i}`,
      dst: `texte ${i}`,
    }));
    await boot({ history });

    type('deepl', 'Hello');
    await translateRow('deepl');

    const saved = lastSaved('history');
    expect(saved).toHaveLength(20);
    expect(saved[0].src).toBe('Hello');
    expect(saved.at(-1).src).toBe('text 18');
  });

  it("restaure une entrée et bascule sur son moteur s'il n'est pas affiché", async () => {
    const entry = { engine: 'lara', source: 'fr', target: 'en-US', src: 'Salut', dst: 'Hi' };
    await boot({ history: [entry] });

    $('history').querySelector('button').click();

    expect(engineTags()).toEqual(['Lara']);
    expect(inRow('lara', '.source').value).toBe('Salut');
    expect(inRow('lara', '.target').textContent).toBe('Hi');
    expect($('src-lang').textContent).toBe('Français');
  });

  it('restaure une entrée sans changer de moteur quand il est déjà affiché', async () => {
    const entry = { engine: 'lara', source: 'en', target: 'fr', src: 'Hi', dst: 'Salut' };
    await boot({ provider: 'both', history: [entry] });

    $('history').querySelector('button').click();

    expect(engineTags()).toEqual(['DeepL', 'Lara']);
    expect(inRow('lara', '.source').value).toBe('Hi');
  });
});

describe('copier', () => {
  /** @param {unknown} writeText */
  function stubClipboard(writeText) {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  }

  it('copie la traduction et affiche un toast qui disparaît', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();
    type('deepl', 'Hello');
    await translateRow('deepl');
    vi.useFakeTimers();

    inRow('deepl', '.copy').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(writeText).toHaveBeenCalledWith('Bonjour');
    expect($('toast').textContent).toBe('Traduction copiée');
    expect($('toast').dataset.visible).toBe('true');

    await vi.advanceTimersByTimeAsync(1800);
    expect($('toast').dataset.visible).toBe('false');
  });

  it("ne copie rien tant qu'il n'y a pas de traduction", async () => {
    const writeText = vi.fn();
    stubClipboard(writeText);
    await boot();

    inRow('deepl', '.copy').click();
    await flush();

    expect(writeText).not.toHaveBeenCalled();
  });

  it("signale l'échec de la copie", async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('refusé')));
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();
    type('deepl', 'Hello');
    await translateRow('deepl');

    inRow('deepl', '.copy').click();
    await flush();

    expect(mocks.logError).toHaveBeenCalledWith('Copie impossible : Error: refusé');
    expect($('toast').textContent).toBe('Impossible de copier');
  });
});

describe('écouter', () => {
  function stubSpeech() {
    const speech = { cancel: vi.fn(), speak: vi.fn() };
    vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        /** @param {string} text */
        constructor(text) {
          this.text = text;
        }
      }
    );
    return speech;
  }

  it('lit la traduction en français', async () => {
    const speech = stubSpeech();
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();
    type('deepl', 'Hello');
    await translateRow('deepl');

    expect(inRow('deepl', '.speak').hidden).toBe(false);
    inRow('deepl', '.speak').click();

    expect(speech.cancel).toHaveBeenCalled();
    expect(speech.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Bonjour', lang: 'fr-FR' }));
  });

  it('lit la traduction en anglais dans le sens français → anglais', async () => {
    const speech = stubSpeech();
    mocks.tauriInvoke.mockResolvedValue('Hello');
    await boot({ sourceLang: 'fr', targetLang: 'en-US' });
    type('deepl', 'Bonjour');
    await translateRow('deepl');

    inRow('deepl', '.speak').click();

    expect(speech.speak).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en-US' }));
  });

  it("ne lit rien tant qu'il n'y a pas de traduction", async () => {
    const speech = stubSpeech();
    await boot();

    inRow('deepl', '.speak').click();

    expect(speech.speak).not.toHaveBeenCalled();
  });
});

describe('paramètres', () => {
  const form = () => $('settings-form');
  /** @param {string} name */
  const field = (name) => form().elements[name];

  async function openSettings(settings = {}) {
    mocks.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings });
    $('open-settings').click();
    await flush();
  }

  /** @param {string} returnValue */
  function closeDialog(returnValue) {
    $('settings').returnValue = returnValue;
    $('settings').dispatchEvent(new Event('close'));
  }

  it('remplit le formulaire avec les réglages enregistrés', async () => {
    await boot({ autoTranslate: true });

    await openSettings({ deeplKey: 'abc:fx', laraId: 'id', laraSecret: 'secret', autoTranslate: true });

    expect($('settings').open).toBe(true);
    expect($('settings').returnValue).toBe('');
    expect(field('deeplKey').value).toBe('abc:fx');
    expect(field('laraId').value).toBe('id');
    expect(field('laraSecret').value).toBe('secret');
    expect(field('autoTranslate').checked).toBe(true);
    expect($('deepl-hint').textContent).toBe('Clé Free détectée (:fx)');
  });

  it('remasque les clés à chaque ouverture', async () => {
    await boot();
    const reveal = form().querySelector('.reveal[data-for="deepl-key"]');
    reveal.click();
    expect($('deepl-key').type).toBe('text');
    $('settings').open = false;

    await openSettings();

    expect($('deepl-key').type).toBe('password');
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
  });

  it('ne recharge pas les réglages si la fenêtre est déjà ouverte', async () => {
    await boot();
    await openSettings();
    const calls = mocks.loadSettings.mock.calls.length;

    $('open-settings').click();
    await flush();

    expect(mocks.loadSettings).toHaveBeenCalledTimes(calls);
  });

  it('indique le type de clé DeepL pendant la saisie', async () => {
    await boot();
    const key = field('deeplKey');

    key.value = 'abc';
    key.dispatchEvent(new Event('input'));
    expect($('deepl-hint').textContent).toBe('Clé Pro');

    key.value = ' abc:fx ';
    key.dispatchEvent(new Event('input'));
    expect($('deepl-hint').textContent).toBe('Clé Free détectée (:fx)');

    key.value = '';
    key.dispatchEvent(new Event('input'));
    expect($('deepl-hint').textContent).toBe('');
  });

  it('affiche puis masque une clé', async () => {
    await boot();
    const reveal = form().querySelector('.reveal[data-for="lara-secret"]');

    reveal.click();
    expect($('lara-secret').type).toBe('text');
    expect(reveal.getAttribute('aria-pressed')).toBe('true');

    reveal.click();
    expect($('lara-secret').type).toBe('password');
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
  });

  it('enregistre les valeurs nettoyées et active la traduction automatique', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot();
    await openSettings();
    field('deeplKey').value = ' key ';
    field('laraId').value = ' id ';
    field('laraSecret').value = ' secret ';
    field('autoTranslate').checked = true;

    closeDialog('save');
    await flush();

    expect(mocks.saveSetting).toHaveBeenCalledWith('deeplKey', 'key');
    expect(mocks.saveSetting).toHaveBeenCalledWith('laraId', 'id');
    expect(mocks.saveSetting).toHaveBeenCalledWith('laraSecret', 'secret');
    expect(mocks.saveSetting).toHaveBeenCalledWith('autoTranslate', true);
    expect($('toast').textContent).toBe('Paramètres enregistrés');

    vi.useFakeTimers();
    type('deepl', 'Hello');
    await vi.advanceTimersByTimeAsync(700);
    // Les nouvelles clés rechargent aussi les listes de langues : on ne compte que les traductions.
    expect(mocks.tauriInvoke.mock.calls.filter(([cmd]) => cmd === 'translate_deepl')).toHaveLength(1);
  });

  it("n'enregistre rien quand la fenêtre est fermée sans valider", async () => {
    await boot();
    await openSettings();

    closeDialog('cancel');
    await flush();

    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });

  it("signale l'échec de l'enregistrement sans activer la traduction automatique", async () => {
    await boot();
    await openSettings();
    field('autoTranslate').checked = true;
    mocks.saveSetting.mockRejectedValue(new Error('disque plein'));

    closeDialog('save');
    await flush();

    expect(mocks.logError).toHaveBeenCalledWith('Enregistrement des paramètres impossible : Error: disque plein');
    expect($('toast').textContent).toBe("Échec de l'enregistrement");

    vi.useFakeTimers();
    type('deepl', 'Hello');
    await vi.advanceTimersByTimeAsync(700);
    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
  });
});

describe('paires libres', () => {
  it('envoie à chaque moteur ses propres codes de langue', async () => {
    mocks.tauriInvoke.mockResolvedValue('안녕하세요');
    await boot({ provider: 'both', sourceLang: 'ja', targetLang: 'ko' });
    type('deepl', 'こんにちは');
    type('lara', 'こんにちは');

    $('translate-all').click();
    await flush();

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_deepl', {
      text: 'こんにちは',
      source: 'JA',
      target: 'KO',
      formal: null,
    });
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_lara', {
      text: 'こんにちは',
      source: 'ja-JP',
      target: 'ko-KR',
      formal: true, // DeepL has no formality for Korean, Lara takes it as an instruction
    });
  });

  it('masque Vous / Tu pour le coréen et le montre pour le japonais', async () => {
    await boot({ targetLang: 'ko' });
    expect($('formality').hidden).toBe(true);

    await boot({ targetLang: 'ja' });
    expect($('formality').hidden).toBe(false);
  });

  it('montre Vous / Tu pour le coréen dès que Lara est affiché', async () => {
    await boot({ provider: 'lara', targetLang: 'ko' });
    expect($('formality').hidden).toBe(false);

    await boot({ provider: 'both', targetLang: 'ko' });
    expect($('formality').hidden).toBe(false);
  });

  it('en détection automatique, envoie une source vide et désactive ⇄', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ sourceLang: 'auto' });

    expect($('src-lang').textContent).toBe('Détecter la langue');
    expect($('swap').disabled).toBe(true);

    type('deepl', 'Hello');
    await translateRow('deepl');
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_deepl', expect.objectContaining({ source: null }));
  });

  it("n'appelle pas un moteur qui ne gère pas la langue et le dit dans sa ligne", async () => {
    mocks.tauriInvoke.mockResolvedValue('traduction');
    await boot({ provider: 'both', targetLang: 'azb' });
    type('deepl', 'Hello');
    type('lara', 'Hello');

    $('translate-all').click();
    await flush();

    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('translate_lara', expect.objectContaining({ target: 'azb-AZ' }));
    expect(inRow('deepl', '.target').textContent).toBe('Azéri du Sud : langue non prise en charge par DeepL.');
    expect(inRow('deepl', '.target').dataset.state).toBe('error');
  });

  it('garde la langue choisie en passant à un moteur qui ne la gère pas', async () => {
    await boot({ provider: 'lara', targetLang: 'azb' });
    $('provider').querySelector('[data-value="deepl"]').click();
    type('deepl', 'Hello');
    await translateRow('deepl');

    expect($('dst-lang').textContent).toBe('Azéri du Sud');
    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
    expect(inRow('deepl', '.target').textContent).toMatch(/non prise en charge par DeepL/);
  });

  it('inverse vers la dernière variante utilisée', async () => {
    await boot({ sourceLang: 'en', targetLang: 'ja', recentLangs: { source: [], target: ['en-GB'] } });

    $('swap').click();

    expect($('src-lang').textContent).toBe('Japonais');
    expect($('dst-lang').textContent).toBe('Anglais (Royaume-Uni)');
  });

  it('retrouve une cible enregistrée sans variante', async () => {
    await boot({ targetLang: 'en' });

    expect($('dst-lang').textContent).toBe('Anglais (États-Unis)');
  });

  it("restaure la paire d'une entrée d'historique", async () => {
    const entry = { engine: 'deepl', source: 'ja', target: 'ko', src: 'はい', dst: '네' };
    await boot({ history: [entry] });

    $('history').querySelector('button').click();

    expect($('src-lang').textContent).toBe('Japonais');
    expect($('dst-lang').textContent).toBe('Coréen');
  });
});

describe('écouter — voix disponibles', () => {
  /** @param {string[]} langs */
  const stubVoices = (langs) => {
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => langs.map((lang) => ({ lang })),
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('SpeechSynthesisUtterance', class {});
  };

  it('masque Écouter quand aucune voix ne parle la langue cible', async () => {
    stubVoices(['fr-FR']);
    await boot({ targetLang: 'ko' });

    expect(inRow('deepl', '.speak').hidden).toBe(true);
  });

  it('garde Écouter quand une voix correspond, même avec un autre séparateur', async () => {
    stubVoices(['ko_KR']);
    await boot({ targetLang: 'ko' });

    expect(inRow('deepl', '.speak').hidden).toBe(false);
  });

  it('garde Écouter quand le système ne liste aucune voix (Android)', async () => {
    stubVoices([]);
    await boot({ targetLang: 'ko' });

    expect(inRow('deepl', '.speak').hidden).toBe(false);
  });
});

describe('choix de la langue', () => {
  const options = () => [...$('lang-list').querySelectorAll('.lang-option')];
  const optionNames = () => options().map((o) => o.firstChild.textContent);
  /** @param {string} name */
  const pick = (name) => options().find((o) => o.firstChild.textContent === name).click();
  /** @param {string} text */
  const search = (text) => {
    $('lang-search').value = text;
    $('lang-search').dispatchEvent(new Event('input'));
  };

  it('ouvre la liste des cibles et enregistre le choix', async () => {
    await boot();

    $('dst-lang').click();
    expect($('lang-picker').open).toBe(true);
    expect($('lang-picker-title').textContent).toBe('Langue cible');
    pick('Coréen');

    expect($('lang-picker').open).toBe(false);
    expect($('dst-lang').textContent).toBe('Coréen');
    expect(mocks.saveSetting).toHaveBeenCalledWith('targetLang', 'ko');
    expect(mocks.saveSetting).toHaveBeenCalledWith('recentLangs', { source: [], target: ['ko'] });
  });

  it('propose « Détecter la langue » en tête des sources seulement', async () => {
    await boot();

    $('src-lang').click();
    expect(optionNames()[0]).toBe('Détecter la langue');
    pick('Détecter la langue');
    expect(mocks.saveSetting).toHaveBeenCalledWith('sourceLang', 'auto');
    expect(mocks.saveSetting).not.toHaveBeenCalledWith('recentLangs', expect.anything());

    $('dst-lang').click();
    expect(optionNames()).not.toContain('Détecter la langue');
  });

  it('affiche les langues récentes avant la liste complète', async () => {
    await boot({ recentLangs: { source: [], target: ['ja', 'ko'] } });

    $('dst-lang').click();

    const headings = [...$('lang-list').querySelectorAll('.picker-section')].map((h) => h.textContent);
    expect(headings).toEqual(['Récentes', 'Toutes les langues']);
    expect(optionNames().slice(0, 2)).toEqual(['Japonais', 'Coréen']);
  });

  it('cherche sans accents et choisit le premier résultat avec Entrée', async () => {
    await boot();
    $('dst-lang').click();

    search('coreen');
    expect(optionNames()).toEqual(['Coréen']);
    $('lang-search').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));

    expect($('dst-lang').textContent).toBe('Coréen');
  });

  it('indique quand aucune langue ne correspond', async () => {
    await boot();
    $('dst-lang').click();

    search('zzz');

    expect(options()).toHaveLength(0);
    expect($('lang-list').textContent).toBe('Aucune langue trouvée.');
  });

  it('ne liste que les langues du moteur affiché', async () => {
    await boot({ provider: 'deepl' });
    $('dst-lang').click();
    expect(optionNames()).toContain('Quechua');
    expect(optionNames()).not.toContain('Azéri du Sud');
  });

  it('en mode « Les deux », liste tout et signale les langues d’un seul moteur', async () => {
    await boot({ provider: 'both' });
    $('dst-lang').click();

    /** @param {string} name */
    const only = (name) =>
      options().find((o) => o.firstChild.textContent === name).querySelector('.lang-only')?.textContent;
    expect(only('Azéri du Sud')).toBe('Lara uniquement');
    expect(only('Quechua')).toBe('DeepL uniquement');
    expect(only('Coréen')).toBeUndefined();
  });

  it('marque la langue sélectionnée', async () => {
    await boot({ targetLang: 'ja' });
    $('dst-lang').click();

    const pressed = options().filter((o) => o.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((o) => o.dataset.key)).toEqual(['ja']);
  });

  it('retraduit ce qui était traduit après un changement de langue', async () => {
    mocks.tauriInvoke.mockResolvedValueOnce('Bonjour').mockResolvedValueOnce('안녕하세요');
    await boot();
    type('deepl', 'Hello');
    await translateRow('deepl');

    $('dst-lang').click();
    pick('Coréen');
    await flush();

    expect(mocks.tauriInvoke).toHaveBeenLastCalledWith('translate_deepl', expect.objectContaining({ target: 'KO' }));
    expect(inRow('deepl', '.target').textContent).toBe('안녕하세요');
  });
});

describe('rechargement des listes de langues', () => {
  const STALE = { fetchedAt: 0, deepl: null, lara: null };

  it('ne recharge pas un cache de moins de 24 h', async () => {
    await boot();
    await flush();

    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
  });

  it('recharge un cache trop ancien, l’enregistre et met à jour les langues', async () => {
    mocks.tauriInvoke.mockImplementation(async (cmd) =>
      cmd === 'deepl_languages' ? LISTS.deepl : [...LISTS.lara, 'sw-KE']
    );
    await boot({ languageCache: STALE });
    await flush();

    const saved = lastSaved('languageCache');
    expect(saved.deepl).toEqual(LISTS.deepl);
    expect(saved.lara).toContain('sw-KE');
    expect(saved.fetchedAt).toBeGreaterThan(0);

    $('dst-lang').click();
    $('lang-search').value = 'swahili';
    $('lang-search').dispatchEvent(new Event('input'));
    expect($('lang-list').querySelectorAll('.lang-option')).toHaveLength(0); // mode DeepL : Lara seule
    $('lang-picker').close();
    $('provider').querySelector('[data-value="lara"]').click();
    $('dst-lang').click();
    $('lang-search').value = 'swahili';
    $('lang-search').dispatchEvent(new Event('input'));
    expect($('lang-list').querySelectorAll('.lang-option')).toHaveLength(1);
  });

  it('garde la liste d’un moteur dont le chargement échoue', async () => {
    mocks.tauriInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'lara_languages') throw { cause: 'Identifiants Lara manquants.' };
      return LISTS.deepl;
    });
    await boot({ languageCache: STALE });
    await flush();

    expect(lastSaved('languageCache')).toMatchObject({ deepl: LISTS.deepl, lara: null });
    expect(mocks.logError).toHaveBeenCalledWith(
      'Chargement des langues impossible (lara) : Identifiants Lara manquants.'
    );
  });

  it('ignore une réponse qui n’est pas une liste et ne met rien en cache', async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ languageCache: STALE });
    await flush();

    expect(mocks.saveSetting).not.toHaveBeenCalledWith('languageCache', expect.anything());
    expect($('dst-lang').textContent).toBe('Français');
  });
});

describe('relecture finale', () => {
  it('réessaie un moteur dont la liste manque, même si le cache est récent (I1)', async () => {
    mocks.tauriInvoke.mockResolvedValue(LISTS.lara);
    await boot({ languageCache: { fetchedAt: Date.now(), deepl: LISTS.deepl, lara: null } });
    await flush();

    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('lara_languages');
    expect(lastSaved('languageCache')).toMatchObject({ deepl: LISTS.deepl, lara: LISTS.lara });
  });

  it('recharge les listes après un changement de clé dans les Paramètres (I1)', async () => {
    mocks.tauriInvoke.mockImplementation(async (cmd) => (cmd === 'deepl_languages' ? LISTS.deepl : LISTS.lara));
    await boot();
    $('open-settings').click();
    await flush();

    $('settings-form').elements.laraId.value = 'nouvel-id';
    $('settings').returnValue = 'save';
    $('settings').dispatchEvent(new Event('close'));
    await flush();

    expect(mocks.tauriInvoke).toHaveBeenCalledWith('deepl_languages');
    expect(mocks.tauriInvoke).toHaveBeenCalledWith('lara_languages');
  });

  it('ne recharge rien quand les clés ne changent pas (I1)', async () => {
    await boot();
    $('open-settings').click();
    await flush();

    $('settings').returnValue = 'save';
    $('settings').dispatchEvent(new Event('close'));
    await flush();

    expect(mocks.tauriInvoke).not.toHaveBeenCalled();
  });

  it("n'affiche pas l'ancienne traduction d'un moteur masqué qui ne gère pas la nouvelle langue (I2)", async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ provider: 'both' });
    type('deepl', 'Hello');
    type('lara', 'Hello');
    $('translate-all').click();
    await flush();

    $('provider').querySelector('[data-value="lara"]').click();
    $('dst-lang').click();
    [...$('lang-list').querySelectorAll('.lang-option')].find((o) => o.dataset.key === 'azb').click();
    await flush();
    const calls = mocks.tauriInvoke.mock.calls.length;
    $('provider').querySelector('[data-value="deepl"]').click();

    expect(inRow('deepl', '.target').textContent).toBe('Azéri du Sud : langue non prise en charge par DeepL.');
    expect(inRow('deepl', '.target').dataset.state).toBe('error');
    expect(mocks.tauriInvoke).toHaveBeenCalledTimes(calls);
  });

  it("vide la traduction d'un moteur masqué après un changement de langue (I2)", async () => {
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ provider: 'both' });
    type('deepl', 'Hello');
    $('translate-all').click();
    await flush();

    $('provider').querySelector('[data-value="lara"]').click();
    $('dst-lang').click();
    [...$('lang-list').querySelectorAll('.lang-option')].find((o) => o.dataset.key === 'ja').click();
    $('provider').querySelector('[data-value="deepl"]').click();

    expect(inRow('deepl', '.source').value).toBe('Hello');
    expect(inRow('deepl', '.target').textContent).toBe('');
  });
});

describe('voix de lecture', () => {
  const VOICES = [
    { voiceURI: 'uri-hortense', name: 'Microsoft Hortense', lang: 'fr-FR' },
    { voiceURI: 'uri-paul', name: 'Microsoft Paul', lang: 'fr-FR' },
    { voiceURI: 'uri-haruka', name: 'Microsoft Haruka', lang: 'ja-JP' },
  ];

  function stubVoices(voices = VOICES) {
    const speech = {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: () => voices,
      addEventListener: vi.fn(),
    };
    vi.stubGlobal('speechSynthesis', speech);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        /** @param {string} text */
        constructor(text) {
          this.text = text;
        }
      }
    );
    return speech;
  }

  async function openSettings(settings = {}) {
    mocks.loadSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings });
    $('open-settings').click();
    await flush();
  }

  const voiceRows = () => [...$('voice-list').querySelectorAll('.voice-row')];
  /** @param {string} lang */
  const voiceSelect = (lang) => $('voice-list').querySelector(`select[data-lang="${lang}"]`);

  it('liste une ligne par langue avec ses voix', async () => {
    stubVoices();
    await boot();
    await openSettings();

    expect(voiceRows().map((r) => r.querySelector('label').textContent)).toEqual(['Français', 'Japonais']);
    expect([...voiceSelect('fr').options].map((o) => o.textContent)).toEqual([
      'Voix par défaut du système',
      'Microsoft Hortense',
      'Microsoft Paul',
    ]);
  });

  it('indique quand le système ne liste aucune voix', async () => {
    stubVoices([]);
    await boot();
    await openSettings();

    expect(voiceRows()).toHaveLength(0);
    expect($('voice-list').textContent).toBe("Le système n'expose aucune voix : la voix par défaut sera utilisée.");
  });

  it('reprend la voix enregistrée à l’ouverture', async () => {
    stubVoices();
    await boot();
    await openSettings({ voices: { fr: 'uri-paul' } });

    expect(voiceSelect('fr').value).toBe('uri-paul');
    expect(voiceSelect('ja').value).toBe('');
  });

  it('enregistre la voix choisie avec les Paramètres', async () => {
    stubVoices();
    await boot();
    await openSettings();

    voiceSelect('fr').value = 'uri-paul';
    $('settings').returnValue = 'save';
    $('settings').dispatchEvent(new Event('close'));
    await flush();

    expect(mocks.saveSetting).toHaveBeenCalledWith('voices', { fr: 'uri-paul' });
  });

  it('garde la voix d’une langue que le système ne liste pas en ce moment', async () => {
    stubVoices();
    await boot();
    await openSettings({ voices: { ko: 'uri-heami' } });

    voiceSelect('fr').value = 'uri-paul';
    $('settings').returnValue = 'save';
    $('settings').dispatchEvent(new Event('close'));
    await flush();

    expect(mocks.saveSetting).toHaveBeenCalledWith('voices', { ko: 'uri-heami', fr: 'uri-paul' });
  });

  it('lit la traduction avec la voix choisie pour la langue cible', async () => {
    const speech = stubVoices();
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ voices: { fr: 'uri-paul' } });
    type('deepl', 'Hello');
    await translateRow('deepl');

    inRow('deepl', '.speak').click();

    const utterance = speech.speak.mock.calls[0][0];
    expect(utterance).toMatchObject({ text: 'Bonjour', lang: 'fr-FR' });
    expect(utterance.voice.voiceURI).toBe('uri-paul');
  });

  it('revient à la voix par défaut quand la voix enregistrée a disparu', async () => {
    const speech = stubVoices();
    mocks.tauriInvoke.mockResolvedValue('Bonjour');
    await boot({ voices: { fr: 'uri-desinstallee' } });
    type('deepl', 'Hello');
    await translateRow('deepl');

    inRow('deepl', '.speak').click();

    expect(speech.speak.mock.calls[0][0].voice).toBeUndefined();
  });

  it('essaie la voix sélectionnée avec le nom de la langue', async () => {
    const speech = stubVoices();
    await boot();
    await openSettings();

    voiceSelect('fr').value = 'uri-paul';
    voiceRows()[0].querySelector('.voice-test').click();

    const utterance = speech.speak.mock.calls[0][0];
    expect(utterance.text).toBe('français');
    expect(utterance.voice.voiceURI).toBe('uri-paul');
  });

  it('ne reconstruit pas les lignes quand les voix changent (saisie conservée)', async () => {
    const speech = stubVoices();
    await boot();
    type('deepl', 'Hello');
    const source = inRow('deepl', '.source');

    const onVoicesChanged = /** @type {() => void} */ (
      speech.addEventListener.mock.calls.find(([name]) => name === 'voiceschanged')?.[1]
    );
    onVoicesChanged();

    expect(inRow('deepl', '.source')).toBe(source);
    expect(source.value).toBe('Hello');
  });

  it('met à jour la liste des voix des Paramètres ouverts sans perdre la sélection', async () => {
    const voices = [...VOICES];
    const speech = stubVoices(voices);
    await boot();
    await openSettings();
    voiceSelect('fr').value = 'uri-paul';

    voices.push({ voiceURI: 'uri-heami', name: 'Microsoft Heami', lang: 'ko-KR' });
    const onVoicesChanged = /** @type {() => void} */ (
      speech.addEventListener.mock.calls.find(([name]) => name === 'voiceschanged')?.[1]
    );
    onVoicesChanged();

    expect(voiceRows().map((r) => r.querySelector('label').textContent)).toEqual(['Coréen', 'Français', 'Japonais']);
    expect(voiceSelect('fr').value).toBe('uri-paul');
  });
});

describe('réglages sur le web', () => {
  const NOTE_FILE = 'settings.json';
  const note = () => document.querySelector('.note span')?.textContent ?? '';

  it('hors Tauri, la note affichée est celle du web', async () => {
    mocks.isTauriRuntime.mockReturnValue(false);
    await boot();

    expect(note()).toContain('chiffrées dans ce navigateur');
    expect(note()).not.toContain(NOTE_FILE);
  });

  it('hors Tauri, la note du web suit le changement de langue', async () => {
    mocks.isTauriRuntime.mockReturnValue(false);
    await boot();
    $('open-settings')?.click();
    await flush();
    $('ui-lang').value = 'en';
    $('ui-lang').dispatchEvent(new Event('change'));
    await flush();

    expect(note()).toContain('encrypted in this browser');
  });

  it('dans Tauri, la note reste celle du fichier settings.json', async () => {
    await boot();

    expect(note()).toContain(NOTE_FILE);
  });

  it('#clear-keys est masqué dans Tauri, visible sur le web', async () => {
    await boot();
    expect($('clear-keys').hidden).toBe(true);

    document.body.replaceWith(document.importNode(new DOMParser().parseFromString(indexHtml, 'text/html').body, true));
    mocks.isTauriRuntime.mockReturnValue(false);
    await boot();
    expect($('clear-keys').hidden).toBe(false);
  });

  it('clic sur #clear-keys vide le coffre et les trois champs', async () => {
    mocks.isTauriRuntime.mockReturnValue(false);
    await boot({ deeplKey: 'k:fx', laraId: 'id', laraSecret: 'secret' });
    $('open-settings').click();
    await flush();
    expect($('deepl-key').value).toBe('k:fx');

    $('clear-keys').click();
    await flush();

    expect(mocks.vaultClear).toHaveBeenCalledOnce();
    expect($('deepl-key').value).toBe('');
    expect($('lara-id').value).toBe('');
    expect($('lara-secret').value).toBe('');
    expect($('toast').textContent).toBe('Vos clés ont été effacées');
    expect(mocks.saveSetting).not.toHaveBeenCalled();
  });

  it("#clear-keys est désactivé pendant l'effacement, puis réactivé (même après un échec)", async () => {
    mocks.isTauriRuntime.mockReturnValue(false);
    /** @type {(reason: Error) => void} */
    let fail = () => {};
    mocks.vaultClear.mockImplementation(() => new Promise((_resolve, reject) => {
      fail = reject;
    }));
    await boot({ deeplKey: 'k:fx', laraId: 'id', laraSecret: 'secret' });
    $('open-settings').click();
    await flush();

    $('clear-keys').click();
    $('clear-keys').click(); // a second click while pending must be ignored
    await flush();
    expect($('clear-keys').disabled).toBe(true);
    expect(mocks.vaultClear).toHaveBeenCalledOnce();

    fail(new Error('boom'));
    await flush();
    expect($('clear-keys').disabled).toBe(false);
  });

  it("si vaultClear échoue, les champs restent et un message d'échec s'affiche", async () => {
    mocks.isTauriRuntime.mockReturnValue(false);
    mocks.vaultClear.mockRejectedValue(new Error('boom'));
    await boot({ deeplKey: 'k:fx', laraId: 'id', laraSecret: 'secret' });
    $('open-settings').click();
    await flush();

    $('clear-keys').click();
    await flush();

    expect($('deepl-key').value).toBe('k:fx');
    expect($('lara-id').value).toBe('id');
    expect($('lara-secret').value).toBe('secret');
    expect($('toast').textContent).toBe("Impossible d'effacer vos clés. Videz les données de ce site dans votre navigateur.");
  });
});
