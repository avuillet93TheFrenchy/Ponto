/**
 * @typedef {object} DeeplTarget
 * @property {string} code
 * @property {boolean} formality
 */

/**
 * @typedef {object} DeeplLists
 * @property {string[]} source
 * @property {DeeplTarget[]} target
 */

/**
 * @typedef {object} SourceLanguage
 * @property {string} key - Canonical key (base language, e.g. `fr`).
 * @property {string | null} deepl - DeepL code, if the engine supports it.
 * @property {string | null} lara - Lara code, if the engine supports it.
 * @property {string} name - Display name.
 */

/**
 * @typedef {object} TargetLanguage
 * @property {string} key - Canonical key (e.g. `en-US`, `zh-Hans`).
 * @property {string | null} deepl
 * @property {string | null} lara
 * @property {boolean} formality - Whether DeepL supports formality for this language.
 * @property {string} name - Display name.
 * @property {string} tts - Code used to pick a reading voice.
 */

/**
 * @typedef {object} TargetEntry
 * @property {string} key
 * @property {string | null} deepl
 * @property {string | null} lara
 * @property {boolean} formality
 */

export const AUTO = 'auto';

/** @type {Record<string, string>} */
const DEFAULT_VARIANT = {
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  nl: 'nl-NL',
  pt: 'pt-BR',
  zh: 'zh-Hans',
};

/** @type {Record<string, string>} */
const ALIASES = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' };

/** @type {Record<string, Record<string, string>>} */
const NAMES = {
  fr: {
    'zh-HK': 'chinois (Hong Kong)',
    azb: 'azéri du Sud',
    cjk: 'tchokwé',
    fon: 'fon',
    fuv: 'peul du Nigeria',
    hne: 'chhattisgarhi',
    kbp: 'kabiyè',
    luo: 'luo',
    pbt: 'pachto du Sud',
    quy: 'quechua (Ayacucho)',
    taq: 'tamasheq',
  },
  en: {
    'zh-HK': 'Chinese (Hong Kong)',
    azb: 'South Azerbaijani',
    cjk: 'Chokwe',
    fon: 'Fon',
    fuv: 'Nigerian Fulfulde',
    hne: 'Chhattisgarhi',
    kbp: 'Kabiyè',
    luo: 'Luo',
    pbt: 'Southern Pashto',
    quy: 'Ayacucho Quechua',
    taq: 'Tamasheq',
  },
};

/** Language used for display names; set it with {@link setLanguageNamesLocale}. */
let namesLocale = 'fr';

/** @type {Map<string, Intl.DisplayNames>} */
const displayNamesCache = new Map();

/** @returns {Intl.DisplayNames} */
function displayNames() {
  let names = displayNamesCache.get(namesLocale);
  if (!names) {
    names = new Intl.DisplayNames([namesLocale], { type: 'language', languageDisplay: 'standard' });
    displayNamesCache.set(namesLocale, names);
  }
  return names;
}

/**
 * Chooses the language used for display names and sorting. Rebuild any catalog
 * created before the change, since each entry stores its name.
 *
 * @param {string} locale - `'fr'` or `'en'`
 */
export function setLanguageNamesLocale(locale) {
  namesLocale = NAMES[locale] ? locale : 'fr';
}

/** @type {{ deepl: DeeplLists, lara: string[] }} */
export const FALLBACK_LISTS = {
  deepl: {
    source: ['DE', 'EN', 'ES', 'FR', 'IT', 'JA', 'KO', 'PT', 'ZH'],
    target: [
      { code: 'DE', formality: true },
      { code: 'EN-GB', formality: false },
      { code: 'EN-US', formality: false },
      { code: 'ES', formality: true },
      { code: 'FR', formality: true },
      { code: 'IT', formality: true },
      { code: 'JA', formality: true },
      { code: 'KO', formality: false },
      { code: 'PT-BR', formality: true },
      { code: 'PT-PT', formality: true },
      { code: 'ZH-HANS', formality: false },
      { code: 'ZH-HANT', formality: false },
    ],
  },
  lara: ['de-DE', 'en-GB', 'en-US', 'es-ES', 'fr-FR', 'it-IT', 'ja-JP', 'ko-KR', 'pt-BR', 'pt-PT', 'zh-CN', 'zh-TW'],
};

/**
 * @param {string} key
 * @returns {string}
 */
export const baseOf = (key) => key.split('-')[0];

/**
 * @param {string} code
 * @returns {string}
 */
function normalize(code) {
  const [base, ...parts] = code.split('-');
  const rest = parts.map((p) => (p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toUpperCase()));
  return [base.toLowerCase(), ...rest].join('-');
}

/**
 * @param {string} code
 * @returns {string}
 */
const canonical = (code) => ALIASES[normalize(code)] ?? normalize(code);

/**
 * @param {string} key
 * @returns {string}
 */
export function languageName(key) {
  return nameOf(key);
}

/**
 * @param {string} key
 * @returns {string}
 */
function nameOf(key) {
  const custom = NAMES[namesLocale];
  let name = custom[key];
  if (!name) {
    const intl = displayNames().of(key);
    name = intl && intl.toLowerCase() !== key.toLowerCase() ? intl : (custom[baseOf(key)] ?? key);
  }
  return name[0].toUpperCase() + name.slice(1);
}

/**
 * @param {{ name: string }} a
 * @param {{ name: string }} b
 * @returns {number}
 */
const byName = (a, b) => a.name.localeCompare(b.name, namesLocale);

/**
 * @param {string} key
 * @param {Partial<TargetEntry>} a
 * @param {Partial<TargetEntry>} b
 * @returns {TargetEntry}
 */
const merge = (key, a, b) => ({
  key,
  deepl: a.deepl ?? b.deepl ?? null,
  lara: a.lara ?? b.lara ?? null,
  formality: Boolean(a.formality || b.formality),
});

/**
 * @param {DeeplTarget[]} deeplTarget
 * @param {string[]} laraCodes
 * @returns {TargetLanguage[]}
 */
function buildTargets(deeplTarget, laraCodes) {
  /** @type {Map<string, TargetEntry>} */
  const found = new Map();
  /** @param {string} key */
  const entry = (key) => {
    let e = found.get(key);
    if (!e) {
      e = { key, deepl: null, lara: null, formality: false };
      found.set(key, e);
    }
    return e;
  };
  for (const { code, formality } of deeplTarget) {
    const e = entry(canonical(code));
    e.deepl ??= code;
    e.formality ||= formality;
  }
  for (const code of laraCodes) entry(canonical(code)).lara ??= code;

  const byBase = Map.groupBy(found.values(), (e) => baseOf(e.key));
  /** @type {TargetEntry[]} */
  const targets = [];
  for (const [base, entries] of byBase) {
    const bare = entries.find((e) => e.key === base);
    const variants = entries.filter((e) => e !== bare);
    if (variants.length === 0) {
      if (bare) targets.push(bare);
    } else if (variants.length === 1) {
      targets.push(merge(base, variants[0], bare ?? {}));
    } else {
      const home = variants.find((e) => e.key === DEFAULT_VARIANT[base]);
      if (bare && home) {
        variants[variants.indexOf(home)] = merge(home.key, home, bare);
      } else if (bare) {
        variants.push({ ...bare, lara: bare.lara ?? variants.find((v) => v.lara)?.lara ?? null });
      }
      targets.push(...variants);
    }
  }
  return targets
    .map((t) => ({ ...t, name: nameOf(t.key), tts: t.lara ?? t.key }))
    .sort(byName);
}

/**
 * @param {string[]} deeplSource
 * @param {string[]} laraCodes
 * @returns {SourceLanguage[]}
 */
function buildSources(deeplSource, laraCodes) {
  /** @type {Map<string, Omit<SourceLanguage, 'name'>>} */
  const found = new Map();
  /** @param {string} key */
  const entry = (key) => {
    let e = found.get(key);
    if (!e) {
      e = { key, deepl: null, lara: null };
      found.set(key, e);
    }
    return e;
  };
  for (const code of deeplSource) entry(baseOf(canonical(code))).deepl ??= code;
  for (const code of laraCodes) {
    const key = canonical(code);
    const e = entry(baseOf(key));
    if (!e.lara || key === DEFAULT_VARIANT[baseOf(key)]) e.lara = code;
  }
  return [...found.values()].map((s) => ({ ...s, name: nameOf(s.key) })).sort(byName);
}

/**
 * Merges the DeepL and Lara language lists into one catalog of sources and targets.
 *
 * @param {{ deepl?: DeeplLists | null, lara?: string[] | null }} lists
 * @returns {{ sources: SourceLanguage[], targets: TargetLanguage[] }}
 */
export function buildCatalog({ deepl, lara }) {
  const laraCodes = lara ?? [];
  return {
    sources: buildSources(deepl?.source ?? [], laraCodes),
    targets: buildTargets(deepl?.target ?? [], laraCodes),
  };
}

/**
 * @param {{ key: string }[]} list
 * @param {string} key
 * @returns {boolean}
 */
const has = (list, key) => list.some((l) => l.key === key);

/**
 * @param {SourceLanguage[]} sources
 * @param {string} key
 * @returns {string | null}
 */
export function resolveSource(sources, key) {
  if (key === AUTO) return AUTO;
  if (has(sources, key)) return key;
  return has(sources, baseOf(key)) ? baseOf(key) : null;
}

/**
 * @param {TargetLanguage[]} targets
 * @param {string} key
 * @returns {string | null}
 */
export function resolveTarget(targets, key) {
  const base = baseOf(key);
  for (const candidate of [key, base, DEFAULT_VARIANT[base]]) {
    if (candidate && has(targets, candidate)) return candidate;
  }
  return targets.find((t) => baseOf(t.key) === base)?.key ?? null;
}

/**
 * @param {TargetLanguage[]} targets
 * @param {string} sourceKey
 * @param {string[]} recentTargets
 * @returns {string | null}
 */
export function swapTarget(targets, sourceKey, recentTargets) {
  const recent = recentTargets.find((k) => baseOf(k) === sourceKey && has(targets, k));
  return recent ?? resolveTarget(targets, sourceKey);
}

/**
 * @param {string} s
 * @returns {string}
 */
const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * @template {{ key: string, name: string }} T
 * @param {T[]} list
 * @param {string} query
 * @returns {T[]}
 */
export function searchLanguages(list, query) {
  const q = fold(query.trim());
  if (!q) return list;
  return list.filter((l) => fold(l.name).includes(q) || l.key.toLowerCase().startsWith(q));
}

/**
 * @param {unknown} v
 * @returns {v is DeeplLists}
 */
export const isDeeplLists = (v) => {
  const lists = /** @type {{ source?: unknown, target?: unknown } | null | undefined} */ (v);
  return Array.isArray(lists?.source) && Array.isArray(lists?.target);
};

/**
 * @param {unknown} v
 * @returns {v is string[]}
 */
export const isLaraList = (v) => Array.isArray(v) && v.every((c) => typeof c === 'string');
