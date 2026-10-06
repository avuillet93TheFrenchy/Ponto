import { FALLBACK_LISTS } from '@js/languages.js';

// Socle intégré + une langue DeepL uniquement (quechua) + une langue Lara uniquement (azéri du Sud).
export const LISTS = {
  deepl: {
    source: [...FALLBACK_LISTS.deepl.source, 'QU'],
    target: [...FALLBACK_LISTS.deepl.target, { code: 'QU', formality: false }],
  },
  lara: [...FALLBACK_LISTS.lara, 'azb-AZ'],
};
