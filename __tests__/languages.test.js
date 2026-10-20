import { describe, expect, it } from 'vitest';
import {
  AUTO,
  FALLBACK_LISTS,
  baseOf,
  buildCatalog,
  isDeeplLists,
  isLaraList,
  languageName,
  resolveSource,
  resolveTarget,
  searchLanguages,
  swapTarget,
} from '@js/languages.js';
import { LISTS } from './fixtures/languages.js';

/**
 * @template {{ key: string }} T
 * @param {T[]} list
 * @param {string} key
 * @returns {T | undefined}
 */
const byKey = (list, key) => list.find((l) => l.key === key);

/**
 * @param {{ key: string }[]} list
 * @returns {string[]}
 */
const keys = (list) => list.map((l) => l.key);

const REAL = {
  deepl: {
    source: ['EN', 'FR', 'ZH', 'JA', 'KO', 'DE'],
    target: [
      { code: 'DE', formality: true },
      { code: 'DE-CH', formality: true },
      { code: 'DE-DE', formality: true },
      { code: 'EN-GB', formality: false },
      { code: 'EN-US', formality: false },
      { code: 'FR', formality: true },
      { code: 'FR-CA', formality: true },
      { code: 'FR-FR', formality: true },
      { code: 'JA', formality: true },
      { code: 'KO', formality: false },
      { code: 'ZH', formality: false },
      { code: 'ZH-HANS', formality: false },
      { code: 'ZH-HANT', formality: false },
    ],
  },
  lara: ['de-DE', 'en-AU', 'en-GB', 'en-US', 'fr-CA', 'fr-FR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-HK', 'zh-TW'],
};

describe('buildCatalog — cibles', () => {
  const { targets } = buildCatalog(REAL);

  it('ramène une langue à une seule variante à sa langue de base', () => {
    expect(byKey(targets, 'ja')).toMatchObject({ deepl: 'JA', lara: 'ja-JP', formality: true, tts: 'ja-JP' });
    expect(byKey(targets, 'ko')).toMatchObject({ deepl: 'KO', lara: 'ko-KR', formality: false, name: 'Coréen' });
    expect(byKey(targets, 'ja-JP')).toBeUndefined();
  });

  it('garde les variantes et rattache le code DeepL sans variante à la variante par défaut', () => {
    expect(keys(targets).filter((k) => k.startsWith('fr'))).toEqual(['fr-CA', 'fr-FR']);
    expect(byKey(targets, 'fr-FR')).toMatchObject({ deepl: 'FR-FR', lara: 'fr-FR', formality: true });
    expect(byKey(targets, 'de-DE')).toMatchObject({ deepl: 'DE-DE', lara: 'de-DE' });
    expect(byKey(targets, 'de-CH')).toMatchObject({ deepl: 'DE-CH', lara: null });
    expect(byKey(targets, 'fr')).toBeUndefined();
  });

  it('fait correspondre le chinois DeepL (ZH-HANS) et Lara (zh-CN)', () => {
    expect(byKey(targets, 'zh-Hans')).toMatchObject({ deepl: 'ZH-HANS', lara: 'zh-CN', tts: 'zh-CN', name: 'Chinois (simplifié)' });
    expect(byKey(targets, 'zh-Hant')).toMatchObject({ deepl: 'ZH-HANT', lara: 'zh-TW' });
    expect(byKey(targets, 'zh-HK')).toMatchObject({ deepl: null, lara: 'zh-HK', name: 'Chinois (Hong Kong)' });
    expect(byKey(targets, 'zh')).toBeUndefined();
  });

  it('trie par nom en français', () => {
    const names = targets.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    expect(byKey(targets, 'en-US')?.name).toBe('Anglais (États-Unis)');
  });
});

describe('buildCatalog — sources', () => {
  const { sources } = buildCatalog(REAL);

  it('ne propose que des langues de base, avec la locale Lara de la variante par défaut', () => {
    expect(keys(sources)).not.toContain('en-US');
    expect(byKey(sources, 'en')).toMatchObject({ deepl: 'EN', lara: 'en-US', name: 'Anglais' });
    expect(byKey(sources, 'zh')).toMatchObject({ deepl: 'ZH', lara: 'zh-CN' });
    expect(byKey(sources, 'ja')).toMatchObject({ deepl: 'JA', lara: 'ja-JP' });
  });
});

describe('buildCatalog — cas limites', () => {
  it('marque les langues gérées par un seul moteur', () => {
    const { sources, targets } = buildCatalog(LISTS);
    expect(byKey(targets, 'qu')).toMatchObject({ deepl: 'QU', lara: null });
    expect(byKey(sources, 'azb')).toMatchObject({ deepl: null, lara: 'azb-AZ' });
  });

  it('rattache un code DeepL sans variante à Lara quand aucune variante par défaut ne convient (serbe)', () => {
    const { targets } = buildCatalog({
      deepl: { source: ['SR'], target: [{ code: 'SR', formality: false }] },
      lara: ['sr-Cyrl-RS', 'sr-Latn-RS'],
    });
    expect(byKey(targets, 'sr')).toMatchObject({ deepl: 'SR', lara: 'sr-Cyrl-RS', tts: 'sr-Cyrl-RS' });
    expect(byKey(targets, 'sr-Latn-RS')).toMatchObject({ deepl: null, lara: 'sr-Latn-RS' });
  });

  it('donne un nom aux langues que Intl ne connaît pas', () => {
    expect(byKey(buildCatalog(LISTS).targets, 'azb')?.name).toBe('Azéri du Sud');
  });

  it('accepte un moteur sans liste', () => {
    const { targets } = buildCatalog({ deepl: null, lara: ['ko-KR'] });
    expect(targets).toEqual([{ key: 'ko', name: 'Coréen', deepl: null, lara: 'ko-KR', formality: false, tts: 'ko-KR' }]);
  });

  it('le socle intégré contient le chinois, le japonais et le coréen', () => {
    const { targets } = buildCatalog(FALLBACK_LISTS);
    expect(keys(targets)).toEqual(expect.arrayContaining(['fr', 'en-US', 'en-GB', 'zh-Hans', 'zh-Hant', 'ja', 'ko']));
  });
});

describe('résolution des clés enregistrées', () => {
  const { sources, targets } = buildCatalog(REAL);

  it('retrouve une cible de base dans une liste à variantes', () => {
    expect(resolveTarget(targets, 'fr')).toBe('fr-FR');
    expect(resolveTarget(targets, 'ja')).toBe('ja');
    expect(resolveTarget(targets, 'ja-JP')).toBe('ja');
    expect(resolveTarget(targets, 'xx')).toBeNull();
  });

  it('ramène une source à sa langue de base', () => {
    expect(resolveSource(sources, AUTO)).toBe(AUTO);
    expect(resolveSource(sources, 'en-GB')).toBe('en');
    expect(resolveSource(sources, 'xx')).toBeNull();
  });

  it("choisit la cible de l'inversion : dernière variante utilisée, sinon celle par défaut", () => {
    expect(swapTarget(targets, 'en', [])).toBe('en-US');
    expect(swapTarget(targets, 'en', ['ja', 'en-GB'])).toBe('en-GB');
    expect(swapTarget(targets, 'ko', [])).toBe('ko');
  });

  it('baseOf renvoie la langue sans variante', () => {
    expect(baseOf('zh-Hans')).toBe('zh');
    expect(baseOf('ko')).toBe('ko');
  });
});

describe('searchLanguages', () => {
  const { targets } = buildCatalog(REAL);

  it('ignore les accents et la casse', () => {
    expect(keys(searchLanguages(targets, 'COREEN'))).toEqual(['ko']);
  });

  it('cherche aussi par code', () => {
    expect(keys(searchLanguages(targets, 'ja'))).toEqual(['ja']);
  });

  it('renvoie toute la liste pour une recherche vide', () => {
    expect(searchLanguages(targets, '  ')).toBe(targets);
  });
});

describe('languageName', () => {
  it('donne le nom français d’un code, même hors catalogue', () => {
    expect(languageName('ja')).toBe('Japonais');
    expect(languageName('azb')).toBe('Azéri du Sud');
  });
});

describe('validation des réponses', () => {
  it('reconnaît les listes DeepL et Lara', () => {
    expect(isDeeplLists(FALLBACK_LISTS.deepl)).toBe(true);
    expect(isDeeplLists('Bonjour')).toBe(false);
    expect(isLaraList(['ja-JP'])).toBe(true);
    expect(isLaraList({ message: 'x' })).toBe(false);
  });
});
