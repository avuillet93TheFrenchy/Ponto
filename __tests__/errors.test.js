import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeBackendError } from '@js/errors.js';
import { setUiLanguage } from '@js/settings.js';

// settings.js reads and writes the Store: only the translation part is needed here.
vi.mock('@tauri/index.js', () => ({ storeGet: vi.fn(), storeSet: vi.fn() }));

beforeEach(async () => {
  await setUiLanguage('fr', { persist: false });
});

/**
 * Messages exactly as the Rust commands build them (translate.rs, lara.rs, languages.rs).
 *
 * @type {{ name: string, raw: string, engine?: string, fr: string, en: string, needsSettings?: boolean }[]}
 */
const CASES = [
  {
    name: 'clé DeepL manquante',
    raw: 'Clé API DeepL manquante. Ajoute-la dans les Paramètres.',
    fr: 'Clé API DeepL manquante. Ajoutez-la dans les Paramètres.',
    en: 'DeepL API key missing. Add it in the Settings.',
    needsSettings: true,
  },
  {
    name: 'identifiants Lara manquants',
    raw: 'Identifiants Lara manquants. Ajoute-les dans les Paramètres.',
    fr: 'Identifiants Lara manquants. Ajoutez-les dans les Paramètres.',
    en: 'Lara credentials missing. Add them in the Settings.',
    needsSettings: true,
  },
  {
    name: 'identifiants Lara refusés',
    raw: 'Identifiants Lara refusés (403) : forbidden',
    fr: 'Identifiants Lara refusés (code 403). Vérifiez-les dans les Paramètres.',
    en: 'Lara credentials refused (code 403). Check them in the Settings.',
  },
  {
    name: 'jeton Lara refusé',
    raw: 'Lara refuse le jeton d’authentification (401).',
    fr: 'Identifiants Lara refusés (code 401). Vérifiez-les dans les Paramètres.',
    en: 'Lara credentials refused (code 401). Check them in the Settings.',
  },
  {
    name: 'erreur réseau DeepL',
    raw: 'Erreur réseau DeepL : connection refused',
    fr: 'Erreur réseau avec DeepL. Vérifiez votre connexion.',
    en: 'Network error with DeepL. Check your connection.',
  },
  {
    name: 'erreur réseau Lara',
    raw: 'Erreur réseau Lara : timeout',
    fr: 'Erreur réseau avec Lara. Vérifiez votre connexion.',
    en: 'Network error with Lara. Check your connection.',
  },
  {
    name: 'erreur API Lara',
    raw: 'Erreur API Lara (500) : boom',
    fr: 'Erreur de Lara (code 500).',
    en: 'Lara error (code 500).',
  },
  {
    name: 'erreur API DeepL (le moteur vient de l’appelant)',
    raw: 'Quota exceeded (code 456 Unknown)',
    engine: 'DeepL',
    fr: 'Erreur de DeepL (code 456).',
    en: 'DeepL error (code 456).',
  },
  {
    name: 'réponse DeepL invalide',
    raw: 'Réponse DeepL invalide : EOF',
    fr: 'Réponse de DeepL invalide.',
    en: 'Invalid response from DeepL.',
  },
  {
    name: 'réponse d’authentification Lara sans jeton',
    raw: 'Réponse d’authentification Lara sans jeton.',
    fr: 'Réponse de Lara invalide.',
    en: 'Invalid response from Lara.',
  },
  {
    name: 'liste des langues invalide',
    raw: 'Liste des langues DeepL invalide.',
    fr: 'Réponse de DeepL invalide.',
    en: 'Invalid response from DeepL.',
  },
  {
    name: 'requête invalide (Worker)',
    raw: 'Requête invalide : texte vide.',
    fr: 'Requête invalide. Vérifiez le texte et les langues.',
    en: 'Invalid request. Check the text and the languages.',
  },
  {
    name: 'origine refusée (Worker)',
    raw: 'Origine refusée.',
    fr: 'Requête refusée par le site. Rechargez la page ; si cela continue, une extension bloque peut-être la requête.',
    en: 'Request refused by the site. Reload the page; if it persists, an extension may be blocking the request.',
  },
  {
    name: 'erreur interne (Worker)',
    raw: 'Erreur interne.',
    fr: 'Erreur interne du serveur. Réessayez dans un instant.',
    en: 'Internal server error. Try again in a moment.',
  },
  {
    name: 'route inconnue (Worker)',
    raw: 'Route inconnue.',
    fr: 'Erreur interne du serveur. Réessayez dans un instant.',
    en: 'Internal server error. Try again in a moment.',
  },
  {
    name: 'trop de requêtes (Worker)',
    raw: 'Trop de requêtes, réessayez dans un instant.',
    fr: 'Trop de requêtes. Réessayez dans un instant.',
    en: 'Too many requests. Try again in a moment.',
  },
];

describe('describeBackendError', () => {
  it.each(CASES)('traduit « $name » en français', ({ raw, engine = 'DeepL', fr, needsSettings = false }) => {
    expect(describeBackendError(raw, engine)).toEqual({ message: fr, needsSettings });
  });

  it.each(CASES)('traduit « $name » en anglais', async ({ raw, engine = 'DeepL', en, needsSettings = false }) => {
    await setUiLanguage('en', { persist: false });

    expect(describeBackendError(raw, engine)).toEqual({ message: en, needsSettings });
  });

  it('ne demande les Paramètres que pour des identifiants manquants', () => {
    const asking = CASES.filter((c) => describeBackendError(c.raw, c.engine ?? 'DeepL').needsSettings);

    expect(asking.map((c) => c.name)).toEqual(['clé DeepL manquante', 'identifiants Lara manquants']);
  });

  it('renvoie tel quel un message inconnu, sans rien masquer', () => {
    expect(describeBackendError('Quelque chose d’inattendu', 'DeepL')).toEqual({
      message: 'Quelque chose d’inattendu',
      needsSettings: false,
    });
  });
});
