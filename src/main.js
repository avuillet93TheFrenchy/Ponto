import './instrument.js';
import { isTauriRuntime, logError, tauriInvoke } from '@tauri/index.js';
import { applyTranslations, bindSwitchAria, detectUiLang, getUiLang, isUiLang, loadSettings, onUiLanguageChange, saveSetting, setUiLanguage, syncSwitchAria, t } from '@js/settings.js';
import { describeBackendError } from '@js/errors.js';
import { vaultClear } from '@js/web/vault.js';
import { initInstallBanner } from '@js/web/install.js';
import { registerServiceWorker } from '@js/web/pwa.js';
import { initThemeToggle } from '@js/theme.js';
import { installAndroidTts } from '@js/tts-android.js';
import { AUTO, FALLBACK_LISTS, baseOf, buildCatalog, isDeeplLists, isLaraList, languageName, resolveSource, resolveTarget, searchLanguages, setLanguageNamesLocale, swapTarget } from '@js/languages.js';
import './style.scss';

/** @typedef {'deepl' | 'lara'} EngineId */
/** @typedef {EngineId | 'both'} Provider */
/** @typedef {import('./js/languages.js').SourceLanguage} SourceLanguage */
/** @typedef {import('./js/languages.js').TargetLanguage} TargetLanguage */
/** @typedef {import('./js/languages.js').DeeplLists} DeeplLists */

/**
 * @typedef {object} HistoryItem
 * @property {EngineId} engine
 * @property {string} source - Source language key.
 * @property {string} target - Target language key.
 * @property {string} src - Source text.
 * @property {string} dst - Translation.
 */

/**
 * @typedef {object} LanguageOption
 * @property {string} key
 * @property {string} name
 * @property {string | null} deepl
 * @property {string | null} lara
 */

/**
 * @typedef {object} Row
 * @property {HTMLTextAreaElement} source
 * @property {HTMLElement} target
 * @property {HTMLElement} count
 * @property {HTMLButtonElement} speak
 */

/**
 * @typedef {object} State
 * @property {Provider} provider
 * @property {string} sourceLang
 * @property {string} targetLang
 * @property {{ source: string[], target: string[] }} recentLangs
 * @property {{ fetchedAt: number, deepl: unknown, lara: unknown }} languageCache
 * @property {boolean} formal
 * @property {boolean} autoTranslate
 * @property {HistoryItem[]} history
 * @property {Record<string, string>} voices
 * @property {Record<EngineId, string>} texts
 * @property {Record<EngineId, string>} outputs
 */

/** @type {EngineId[]} */
const ENGINE_IDS = ['deepl', 'lara'];

/** @type {Record<EngineId, { name: string, command: string }>} */
const ENGINES = {
  deepl: { name: 'DeepL', command: 'translate_deepl' },
  lara: { name: 'Lara', command: 'translate_lara' },
};

const MAX_CHARS = 10000;
const AUTO_TRANSLATE_DELAY_MS = 700;
const HISTORY_SIZE = 20;
const RECENT_LANGS = 5;
const LANGUAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
installAndroidTts();
void registerServiceWorker();
const canSpeak = 'speechSynthesis' in window;

/**
 * Sends a message to the log without ever throwing, even when the Tauri log plugin is unavailable.
 *
 * @param {string} message
 */
const report = (message) => {
  logError(message).catch(() => {});
};

/**
 * Returns the element with the given id, or throws if the page does not contain it.
 *
 * @param {string} id
 * @returns {HTMLElement}
 */
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Élément #${id} introuvable`);
  return el;
};

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement}
 */
const must = (root, selector) => {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Élément ${selector} introuvable`);
  return /** @type {HTMLElement} */ (el);
};

/**
 * @param {Event} e
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
const closestFrom = (e, selector) =>
  e.target instanceof Element ? /** @type {HTMLElement | null} */ (e.target.closest(selector)) : null;

const panes = $('panes');
const rowTemplate = /** @type {HTMLTemplateElement} */ ($('engine-row'));

/** @type {State} */
const state = {
  provider: 'deepl',
  sourceLang: 'en',
  targetLang: 'fr',
  recentLangs: { source: [], target: [] },
  languageCache: { fetchedAt: 0, deepl: null, lara: null },
  formal: true,
  autoTranslate: false,
  history: [],
  voices: {},
  texts: { deepl: '', lara: '' },
  outputs: { deepl: '', lara: '' },
};

/** @type {Partial<Record<EngineId, Row>>} */
let rows = {};

/** @type {Record<EngineId, number>} */
const requestSeq = { deepl: 0, lara: 0 };
/** @type {Partial<Record<EngineId, ReturnType<typeof setTimeout>>>} */
const autoTimers = {};

let catalog = buildCatalog(FALLBACK_LISTS);

/** @returns {EngineId[]} */
const visibleEngines = () => (state.provider === 'both' ? ENGINE_IDS : [state.provider]);

const sourceEntry = () => catalog.sources.find((l) => l.key === state.sourceLang);
const targetEntry = () => catalog.targets.find((l) => l.key === state.targetLang);

function applyCatalog() {
  const { deepl, lara } = state.languageCache;
  catalog = buildCatalog({
    deepl: /** @type {DeeplLists | null} */ (deepl) ?? FALLBACK_LISTS.deepl,
    lara: /** @type {string[] | null} */ (lara) ?? FALLBACK_LISTS.lara,
  });
  state.sourceLang = resolveSource(catalog.sources, state.sourceLang) ?? 'en';
  state.targetLang = resolveTarget(catalog.targets, state.targetLang) ?? resolveTarget(catalog.targets, 'fr') ?? 'fr';
}

/** @type {Record<EngineId, { command: string, isValid: (value: unknown) => boolean }>} */
const LANGUAGE_SOURCES = {
  deepl: { command: 'deepl_languages', isValid: isDeeplLists },
  lara: { command: 'lara_languages', isValid: isLaraList },
};

/**
 * Turns an unknown error value into readable text, without falling back to `[object Object]`.
 *
 * @param {unknown} value
 * @returns {string}
 */
function causeText(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  return JSON.stringify(value) ?? '';
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function errorText(err) {
  const e = /** @type {{ cause?: unknown, message?: string } | null | undefined} */ (err);
  return causeText(e?.cause ?? e?.message ?? err);
}

/** @param {{ force?: boolean }} [options] */
async function refreshLanguages({ force = false } = {}) {
  const expired = force || Date.now() - state.languageCache.fetchedAt >= LANGUAGE_CACHE_TTL_MS;
  const due = ENGINE_IDS.filter((engine) => expired || !state.languageCache[engine]);
  if (!due.length) return;
  const next = { ...state.languageCache };
  let updated = false;
  await Promise.all(
    due.map(async (engine) => {
      const { command, isValid } = LANGUAGE_SOURCES[engine];
      try {
        const list = await tauriInvoke(command);
        if (!isValid(list)) throw new Error('réponse invalide');
        next[engine] = list;
        updated = true;
      } catch (err) {
        report(`Chargement des langues impossible (${engine}) : ${errorText(err)}`);
      }
    })
  );
  if (!updated) return;
  next.fetchedAt = Date.now();
  state.languageCache = next;
  await saveSetting('languageCache', next);
  applyCatalog();
  renderToolbar();
  if (picker.open) renderPicker();
}

/**
 * @param {EngineId} engine
 * @returns {string | null}
 */
function unsupportedMessage(engine) {
  const sourceOk = state.sourceLang === AUTO || Boolean(sourceEntry()?.[engine]);
  if (targetEntry()?.[engine] && sourceOk) return null;
  const lang = sourceOk ? (targetEntry()?.name ?? state.targetLang) : (sourceEntry()?.name ?? state.sourceLang);
  return t('error.unsupported', { lang, engine: ENGINES[engine].name });
}

function forgetHiddenOutputs() {
  for (const engine of ENGINE_IDS) {
    if (!visibleEngines().includes(engine)) state.outputs[engine] = '';
  }
}

const systemVoices = () => (canSpeak ? (speechSynthesis.getVoices?.() ?? []) : []);

/**
 * @param {string} lang
 * @returns {string}
 */
const voiceBase = (lang) => baseOf(lang.replace('_', '-')).toLowerCase();

/**
 * @param {string | undefined} uri
 * @returns {SpeechSynthesisVoice | undefined}
 */
const findVoice = (uri) => (uri ? systemVoices().find((v) => v.voiceURI === uri) : undefined);

/** @param {string} lang */
function hasVoice(lang) {
  const voices = systemVoices();
  return voices.length === 0 || voices.some((v) => voiceBase(v.lang) === voiceBase(lang));
}

function updateSpeakButtons() {
  const hidden = !canSpeak || !hasVoice(targetEntry()?.tts ?? state.targetLang);
  for (const row of Object.values(rows)) row.speak.hidden = hidden;
}

/** @param {number} n */
const formatCount = (n) => `${n.toLocaleString(getUiLang())} / ${MAX_CHARS.toLocaleString(getUiLang())}`;

function applyOrientation() {
  const native = /** @type {Window & { TraducteurOrientation?: { set(mode: string): void } }} */ (window);
  native.TraducteurOrientation?.set(state.provider === 'both' ? 'landscape' : 'portrait');
}

function renderRows() {
  rows = {};
  panes.dataset.mode = state.provider;
  applyOrientation();
  panes.replaceChildren(
    ...visibleEngines().map((engine) => {
      const fragment = /** @type {DocumentFragment} */ (rowTemplate.content.cloneNode(true));
      applyTranslations(fragment);
      /** @type {Row} */
      const row = {
        source: /** @type {HTMLTextAreaElement} */ (must(fragment, '.source')),
        target: must(fragment, '.target'),
        count: must(fragment, '.count'),
        speak: /** @type {HTMLButtonElement} */ (must(fragment, '.speak')),
      };
      row.source.id = `source-${engine}`;
      for (const tag of fragment.querySelectorAll('.engine-tag, .engine-badge')) {
        /** @type {HTMLElement} */ (tag).dataset.engine = engine;
      }
      must(fragment, '.engine-tag').textContent = ENGINES[engine].name;
      must(fragment, '.engine-badge').textContent = t('pane.translatedWith', { engine: ENGINES[engine].name });

      row.source.value = state.texts[engine];
      row.target.textContent = state.outputs[engine];
      updateCount(row, state.texts[engine]);
      const unsupported = state.texts[engine].trim() && unsupportedMessage(engine);
      if (unsupported) {
        row.target.textContent = unsupported;
        row.target.dataset.state = 'error';
      }

      row.source.addEventListener('input', () => onSourceInput(engine));
      row.source.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void translateAll();
        }
      });
      must(fragment, '.clear').addEventListener('click', () => clearEngine(engine));
      must(fragment, '.translate-one').addEventListener('click', () => void translate(engine));
      must(fragment, '.copy').addEventListener('click', () => void copyOutput(engine));
      row.speak.addEventListener('click', () => speakOutput(engine));

      rows[engine] = row;
      return fragment;
    })
  );
  updateSpeakButtons();
  $('translate-all-label').textContent = t(state.provider === 'both' ? 'translate.both' : 'translate');
}

function renderToolbar() {
  for (const button of $('provider').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === state.provider));
  }
  for (const button of $('formality').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.value === String(state.formal)));
  }
  $('src-lang').textContent =
    state.sourceLang === AUTO ? t('lang.detect') : (sourceEntry()?.name ?? state.sourceLang);
  $('dst-lang').textContent = targetEntry()?.name ?? state.targetLang;
  /** @type {HTMLButtonElement} */ ($('swap')).disabled = state.sourceLang === AUTO;
  $('formality').hidden = visibleEngines().every((engine) => formalFor(engine) === null);
}

/**
 * Formality to send to an engine: DeepL only supports it for some targets, while Lara
 * receives it as an instruction for any target it translates to.
 *
 * @param {EngineId} engine
 * @returns {boolean | null} `null` when the engine has no formality for the current target.
 */
function formalFor(engine) {
  const target = targetEntry();
  const supported = engine === 'lara' ? Boolean(target?.lara) : Boolean(target?.formality);
  return supported ? state.formal : null;
}

function renderHistory() {
  const container = $('history');
  container.replaceChildren(
    ...state.history.slice(0, 3).map((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `${ENGINES[entry.engine].name} : ${entry.src}\n→ ${entry.dst}`;
      const badge = document.createElement('span');
      badge.className = 'tag';
      badge.dataset.engine = entry.engine;
      badge.textContent = ENGINES[entry.engine].name[0]; // D ou L, comme sur le logo
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = ' → ';
      button.append(badge, entry.src, arrow, entry.dst);
      button.addEventListener('click', () => restoreHistory(entry));
      return button;
    })
  );
}

/**
 * @param {Row} row
 * @param {string} text
 */
function updateCount(row, text) {
  row.count.textContent = formatCount(text.length);
  row.count.dataset.over = String(text.length > MAX_CHARS);
}

/**
 * @param {EngineId} engine
 * @param {string} text
 * @param {'error' | 'loading'} [status]
 */
function setOutput(engine, text, status) {
  state.outputs[engine] = status === 'error' ? '' : text;
  const row = rows[engine];
  if (!row) return;
  row.target.textContent = text;
  if (status) row.target.dataset.state = status;
  else delete row.target.dataset.state;
}

/** @param {EngineId} engine */
async function translate(engine) {
  const text = state.texts[engine].trim();
  const seq = ++requestSeq[engine];
  clearTimeout(autoTimers[engine]);

  if (!text) {
    setOutput(engine, '');
    return;
  }
  if (text.length > MAX_CHARS) {
    setOutput(engine, t('error.tooLong', { max: MAX_CHARS.toLocaleString(getUiLang()) }), 'error');
    return;
  }
  const unsupported = unsupportedMessage(engine);
  if (unsupported) {
    setOutput(engine, unsupported, 'error');
    return;
  }
  const source = state.sourceLang === AUTO ? null : (sourceEntry()?.[engine] ?? null);
  const target = targetEntry()?.[engine] ?? null;

  const row = rows[engine];
  if (row) row.target.dataset.state = 'loading';
  try {
    const translation = /** @type {string} */ (
      await tauriInvoke(ENGINES[engine].command, {
        text,
        source,
        target,
        formal: formalFor(engine),
      })
    );
    if (seq !== requestSeq[engine]) return;
    setOutput(engine, translation);
    addToHistory({ engine, source: state.sourceLang, target: state.targetLang, src: text, dst: translation });
  } catch (err) {
    if (seq === requestSeq[engine]) showTranslateError(engine, err);
  }
}

/**
 * @param {EngineId} engine
 * @param {unknown} err
 */
function showTranslateError(engine, err) {
  const cause = /** @type {{ cause?: unknown } | null | undefined} */ (err)?.cause;
  const raw = cause ? causeText(cause) : '';
  const { message, needsSettings } = raw
    ? describeBackendError(raw, ENGINES[engine].name)
    : { message: t('error.generic'), needsSettings: false };
  setOutput(engine, message, 'error');
  report(`Échec de traduction (${engine}) : ${raw || message}`);
  if (needsSettings) void openSettings();
}

async function translateAll() {
  const button = /** @type {HTMLButtonElement} */ ($('translate-all'));
  button.disabled = true;
  try {
    await Promise.all(visibleEngines().map((engine) => translate(engine)));
  } finally {
    button.disabled = false;
  }
}

/** @param {EngineId} engine */
function onSourceInput(engine) {
  const row = rows[engine];
  if (!row) return;
  const text = row.source.value;
  state.texts[engine] = text;
  updateCount(row, text);
  if (state.autoTranslate) {
    clearTimeout(autoTimers[engine]);
    autoTimers[engine] = setTimeout(() => void translate(engine), AUTO_TRANSLATE_DELAY_MS);
  }
}

/** @param {EngineId} engine */
function clearEngine(engine) {
  requestSeq[engine]++;
  clearTimeout(autoTimers[engine]);
  state.texts[engine] = '';
  const row = rows[engine];
  if (row) {
    row.source.value = '';
    updateCount(row, '');
  }
  setOutput(engine, '');
  row?.source.focus();
}

/** @param {Provider} provider */
function setProvider(provider) {
  if (provider === state.provider) return;
  if (provider === 'both') {
    /** @type {[EngineId, EngineId]} */
    const [from, to] = state.texts.deepl ? ['deepl', 'lara'] : ['lara', 'deepl'];
    if (!state.texts[to]) state.texts[to] = state.texts[from];
  }
  state.provider = provider;
  void saveSetting('provider', provider);
  renderToolbar();
  renderRows();
}

function swapLanguages() {
  if (state.sourceLang === AUTO) return;
  const source = resolveSource(catalog.sources, baseOf(state.targetLang)) ?? state.sourceLang;
  state.targetLang = swapTarget(catalog.targets, state.sourceLang, state.recentLangs.target) ?? state.targetLang;
  state.sourceLang = source;
  for (const engine of visibleEngines()) {
    if (state.outputs[engine]) {
      [state.texts[engine], state.outputs[engine]] = [state.outputs[engine], state.texts[engine]];
    }
  }
  forgetHiddenOutputs();
  void saveSetting('sourceLang', state.sourceLang);
  void saveSetting('targetLang', state.targetLang);
  renderToolbar();
  renderRows();
}

/** @param {boolean} formal */
function setFormal(formal) {
  if (formal === state.formal) return;
  state.formal = formal;
  void saveSetting('formal', formal);
  renderToolbar();
  retranslateShown();
}

function retranslateShown() {
  for (const engine of visibleEngines()) {
    if (state.outputs[engine]) void translate(engine);
  }
}

/** @param {HistoryItem} entry */
function addToHistory(entry) {
  state.history = [
    entry,
    ...state.history.filter(
      (h) => !(h.src === entry.src && h.engine === entry.engine && h.source === entry.source && h.target === entry.target)
    ),
  ].slice(0, HISTORY_SIZE);
  void saveSetting('history', state.history);
  renderHistory();
}

/** @param {HistoryItem} entry */
function restoreHistory(entry) {
  state.sourceLang = resolveSource(catalog.sources, entry.source) ?? state.sourceLang;
  state.targetLang = resolveTarget(catalog.targets, entry.target) ?? state.targetLang;
  state.texts[entry.engine] = entry.src;
  state.outputs[entry.engine] = entry.dst;
  if (!visibleEngines().includes(entry.engine)) state.provider = entry.engine;
  renderToolbar();
  renderRows();
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;

/** @param {string} message */
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.dataset.visible = 'true';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.dataset.visible = 'false'), 1800);
}

/** @param {EngineId} engine */
async function copyOutput(engine) {
  const text = state.outputs[engine];
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(t('toast.copied'));
  } catch (err) {
    report(`Copie impossible : ${err}`);
    toast(t('toast.copyFailed'));
  }
}

/** @param {EngineId} engine */
function speakOutput(engine) {
  const text = state.outputs[engine];
  if (!text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = targetEntry()?.tts ?? state.targetLang;
  const voice = findVoice(state.voices[voiceBase(utterance.lang)]);
  if (voice) utterance.voice = voice; // voix désinstallée depuis : voix par défaut
  speechSynthesis.speak(utterance);
}

const picker = /** @type {HTMLDialogElement} */ ($('lang-picker'));
/** @type {'source' | 'target'} */
let pickerSide = 'target';

/** @returns {LanguageOption} */
const autoOption = () => ({ key: AUTO, name: t('lang.detect'), deepl: AUTO, lara: AUTO });

/** @returns {(SourceLanguage | TargetLanguage)[]} */
function pickerLanguages() {
  const list = pickerSide === 'source' ? catalog.sources : catalog.targets;
  const provider = state.provider;
  return provider === 'both' ? list : list.filter((l) => l[provider]);
}

/**
 * @param {LanguageOption} lang
 * @returns {string}
 */
function onlyOneEngine(lang) {
  if (state.provider !== 'both') return '';
  if (!lang.deepl) return t('picker.laraOnly');
  if (!lang.lara) return t('picker.deeplOnly');
  return '';
}

/** @param {LanguageOption} lang */
function optionButton(lang) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lang-option';
  button.dataset.key = lang.key;
  const current = pickerSide === 'source' ? state.sourceLang : state.targetLang;
  button.setAttribute('aria-pressed', String(lang.key === current));
  button.append(lang.name);
  const only = onlyOneEngine(lang);
  if (only) {
    const tag = document.createElement('span');
    tag.className = 'lang-only';
    tag.textContent = only;
    button.append(tag);
  }
  return button;
}

/**
 * @param {string} title
 * @param {LanguageOption[]} langs
 * @returns {HTMLElement[]}
 */
function pickerSection(title, langs) {
  if (!langs.length) return [];
  const heading = document.createElement('h3');
  heading.className = 'picker-section';
  heading.textContent = title;
  return [heading, ...langs.map(optionButton)];
}

function renderPicker() {
  const langs = pickerLanguages();
  const query = /** @type {HTMLInputElement} */ ($('lang-search')).value;
  /** @type {HTMLElement[]} */
  let children;
  if (query.trim()) {
    const found = searchLanguages(langs, query);
    const empty = document.createElement('p');
    empty.className = 'picker-empty';
    empty.textContent = t('picker.empty');
    children = found.length ? found.map(optionButton) : [empty];
  } else {
    const recent = state.recentLangs[pickerSide]
      .map((key) => langs.find((l) => l.key === key))
      .filter((l) => l !== undefined);
    children = [
      ...(pickerSide === 'source' ? [optionButton(autoOption())] : []),
      ...pickerSection(t('picker.recent'), recent),
      ...pickerSection(t('picker.all'), langs),
    ];
  }
  $('lang-list').replaceChildren(...children);
}

/** @param {'source' | 'target'} side */
function openPicker(side) {
  pickerSide = side;
  $('lang-picker-title').textContent = t(side === 'source' ? 'picker.titleSource' : 'picker.titleTarget');
  const search = /** @type {HTMLInputElement} */ ($('lang-search'));
  search.value = '';
  renderPicker();
  picker.showModal();
  search.focus();
}

/** @param {string} key */
function chooseLanguage(key) {
  const side = pickerSide;
  if (side === 'source') state.sourceLang = key;
  else state.targetLang = key;
  void saveSetting(side === 'source' ? 'sourceLang' : 'targetLang', key);
  if (key !== AUTO) {
    const recent = [key, ...state.recentLangs[side].filter((k) => k !== key)].slice(0, RECENT_LANGS);
    state.recentLangs = { ...state.recentLangs, [side]: recent };
    void saveSetting('recentLangs', state.recentLangs);
  }
  picker.close();
  forgetHiddenOutputs();
  renderToolbar();
  renderRows();
  retranslateShown();
}

const dialog = /** @type {HTMLDialogElement} */ ($('settings'));
const form = /** @type {HTMLFormElement} */ ($('settings-form'));
const fields = /** @type {HTMLFormControlsCollection & {
  deeplKey: HTMLInputElement,
  laraId: HTMLInputElement,
  laraSecret: HTMLInputElement,
  autoTranslate: HTMLInputElement,
  uiLang: HTMLSelectElement,
}} */ (form.elements);

function updateDeeplHint() {
  const key = fields.deeplKey.value.trim();
  const hint = t(key.endsWith(':fx') ? 'settings.deeplFree' : 'settings.deeplPro');
  $('deepl-hint').textContent = key ? hint : '';
}

/** @type {Record<string, string>} */
let savedVoices = {};

/** @returns {Record<string, string>} */
function readVoiceSelections() {
  const selections = { ...savedVoices };
  for (const select of $('voice-list').querySelectorAll('select')) {
    const lang = select.dataset.lang;
    if (!lang) continue;
    if (select.value) selections[lang] = select.value;
    else delete selections[lang];
  }
  return selections;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function playIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M8 5v14l11-7z');
  svg.append(path);
  return svg;
}

/**
 * @param {string} base
 * @param {SpeechSynthesisVoice[]} voices
 * @param {string | undefined} selected
 */
function voiceRow(base, voices, selected) {
  const row = document.createElement('div');
  row.className = 'voice-row';
  const id = `voice-${base}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = languageName(base);
  const select = document.createElement('select');
  select.id = id;
  select.dataset.lang = base;
  select.append(new Option(t('voice.default'), ''));
  for (const voice of voices) select.append(new Option(voice.name, voice.voiceURI));
  select.value = voices.some((v) => v.voiceURI === selected) ? (selected ?? '') : '';
  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'icon-btn voice-test';
  test.setAttribute('aria-label', t('voice.test', { lang: label.textContent ?? base }));
  test.append(playIcon());
  row.append(label, select, test);
  return row;
}

/** @param {Record<string, string>} selected */
function renderVoiceSettings(selected) {
  const groups = Map.groupBy(systemVoices(), (v) => voiceBase(v.lang));
  if (!groups.size) {
    const empty = document.createElement('p');
    empty.className = 'voice-empty';
    empty.textContent = t(canSpeak ? 'voice.none' : 'voice.unavailable');
    $('voice-list').replaceChildren(empty);
    return;
  }
  const bases = [...groups.keys()].sort((a, b) => languageName(a).localeCompare(languageName(b), getUiLang()));
  $('voice-list').replaceChildren(...bases.map((base) => voiceRow(base, groups.get(base) ?? [], selected[base])));
}

/** @param {HTMLElement} button */
function testVoice(button) {
  const select = button.closest('.voice-row')?.querySelector('select');
  const base = select?.dataset.lang;
  if (!select || !base) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(new Intl.DisplayNames([base], { type: 'language' }).of(base));
  utterance.lang = base;
  const voice = findVoice(select.value);
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

function onVoicesChanged() {
  updateSpeakButtons();
  if (dialog.open) renderVoiceSettings(readVoiceSelections());
}

let savedKeys = '';

async function openSettings() {
  if (dialog.open) return;
  /** @type {Pick<import('./js/settings.js').Settings, 'deeplKey' | 'laraId' | 'laraSecret' | 'voices'>} */
  let settings = { deeplKey: '', laraId: '', laraSecret: '', voices: state.voices };
  try {
    settings = await loadSettings();
  } catch (err) {
    report(`Lecture des paramètres impossible : ${errorText(err)}`);
  }
  savedKeys =[settings.deeplKey, settings.laraId, settings.laraSecret].join('\n');
  fields.deeplKey.value = settings.deeplKey;
  fields.laraId.value = settings.laraId;
  fields.laraSecret.value = settings.laraSecret;
  fields.autoTranslate.checked = state.autoTranslate;
  syncSwitchAria(fields.autoTranslate);
  fields.uiLang.value = getUiLang();
  savedVoices = settings.voices;
  renderVoiceSettings(settings.voices);
  for (const button of form.querySelectorAll('.reveal')) setRevealed(/** @type {HTMLElement} */ (button), false);
  updateDeeplHint();
  dialog.returnValue = '';
  dialog.showModal();
}

/**
 * @param {HTMLElement} button
 * @param {boolean} revealed
 */
function setRevealed(button, revealed) {
  /** @type {HTMLInputElement} */ ($(button.dataset.for ?? '')).type = revealed ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(revealed));
}

dialog.addEventListener('close', async () => {
  if (dialog.returnValue !== 'save') return;
  const values = {
    deeplKey: fields.deeplKey.value.trim(),
    laraId: fields.laraId.value.trim(),
    laraSecret: fields.laraSecret.value.trim(),
    autoTranslate: fields.autoTranslate.checked,
    voices: readVoiceSelections(),
  };
  try {
    await Promise.all(Object.entries(values).map(([key, value]) => saveSetting(key, value)));
    state.autoTranslate = values.autoTranslate;
    state.voices = values.voices;
    toast(t('toast.saved'));
    if ([values.deeplKey, values.laraId, values.laraSecret].join('\n') !== savedKeys) {
      void refreshLanguages({ force: true });
    }
  } catch (err) {
    report(`Enregistrement des paramètres impossible : ${err}`);
    toast(t('toast.saveFailed'));
  }
});

fields.deeplKey.addEventListener('input', updateDeeplHint);
fields.uiLang.addEventListener('change', () => {
  if (!isUiLang(fields.uiLang.value)) return;
  setUiLanguage(fields.uiLang.value).catch((err) => report(`Enregistrement de la langue impossible : ${errorText(err)}`));
});
$('voice-list').addEventListener('click', (e) => {
  const button = closestFrom(e, '.voice-test');
  if (button) testVoice(button);
});
for (const node of form.querySelectorAll('.reveal')) {
  const button = /** @type {HTMLElement} */ (node);
  button.addEventListener('click', () =>
    setRevealed(button, button.getAttribute('aria-pressed') !== 'true')
  );
}

$('provider').addEventListener('click', (e) => {
  const value = closestFrom(e, 'button')?.dataset.value;
  if (value === 'deepl' || value === 'lara' || value === 'both') setProvider(value);
});
$('formality').addEventListener('click', (e) => {
  const value = closestFrom(e, 'button')?.dataset.value;
  if (value) setFormal(value === 'true');
});
$('swap').addEventListener('click', swapLanguages);
$('src-lang').addEventListener('click', () => openPicker('source'));
$('dst-lang').addEventListener('click', () => openPicker('target'));
$('lang-search').addEventListener('input', renderPicker);
$('lang-search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const first = $('lang-list').querySelector('.lang-option');
  if (first instanceof HTMLElement) first.click();
});
$('lang-list').addEventListener('click', (e) => {
  const key = closestFrom(e, '.lang-option')?.dataset.key;
  if (key) chooseLanguage(key);
});
$('translate-all').addEventListener('click', () => void translateAll());
$('open-settings').addEventListener('click', () => void openSettings());
initThemeToggle(/** @type {HTMLButtonElement} */ ($('theme-toggle')));
bindSwitchAria();

let uiLang = detectUiLang();
try {
  const saved = await loadSettings();
  uiLang = saved.uiLang;
  Object.assign(state, {
    provider: saved.provider,
    sourceLang: saved.sourceLang,
    targetLang: saved.targetLang,
    recentLangs: saved.recentLangs,
    languageCache: saved.languageCache,
    formal: saved.formal,
    autoTranslate: saved.autoTranslate,
    history: /** @type {HistoryItem[]} */ (saved.history),
    voices: saved.voices,
  });
} catch (err) {
  report(`Lecture des paramètres impossible : ${err}`);
}

const clearKeysButton = /** @type {HTMLButtonElement} */ ($('clear-keys'));
if (!isTauriRuntime()) {
  // Web build: keys live in the encrypted vault, not in settings.json. The key survives
  // language switches because applyTranslations reads `data-i18n` each time.
  const note = /** @type {HTMLElement} */ (document.querySelector('[data-i18n="settings.note"]'));
  note.dataset.i18n = 'settings.noteWeb';
  applyTranslations();
  clearKeysButton.hidden = false;
}

clearKeysButton.addEventListener('click', async () => {
  // The write is asynchronous: ignore further clicks until it ends.
  if (clearKeysButton.disabled) return;
  clearKeysButton.disabled = true;
  try {
    await vaultClear();
  } catch (err) {
    report(`Effacement des clés impossible : ${errorText(err)}`);
    toast(t('settings.keysClearFailed'));
    return;
  } finally {
    clearKeysButton.disabled = false;
  }
  fields.deeplKey.value = '';
  fields.laraId.value = '';
  fields.laraSecret.value = '';
  savedKeys = ['', '', ''].join('\n');
  updateDeeplHint();
  toast(t('settings.keysCleared'));
});

/** Rebuilds everything that shows text generated from JavaScript. */
function refreshUi() {
  setLanguageNamesLocale(getUiLang());
  applyCatalog();
  renderToolbar();
  renderRows();
  renderHistory();
  updateDeeplHint();
  if (picker.open) {
    $('lang-picker-title').textContent = t(pickerSide === 'source' ? 'picker.titleSource' : 'picker.titleTarget');
    renderPicker();
  }
  if (dialog.open) renderVoiceSettings(readVoiceSelections());
}

await setUiLanguage(uiLang, { persist: false });
setLanguageNamesLocale(uiLang);
onUiLanguageChange(refreshUi);
applyCatalog();
if (canSpeak) speechSynthesis.addEventListener?.('voiceschanged', onVoicesChanged);
renderToolbar();
renderRows();
renderHistory();
// Before any network wait: `beforeinstallprompt` fires once and early, a listener added after the
// language lists load could miss it.
initInstallBanner();
await refreshLanguages();
