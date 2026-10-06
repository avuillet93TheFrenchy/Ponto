// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { deeplBaseUrl, translateDeepl, deeplLanguages } from '../../worker/src/deepl.ts';

/**
 * Builds a fake fetch answering with the given JSON bodies in order.
 * @param {...{ status?: number, body: unknown }} answers
 */
function fakeFetch(...answers) {
  const fn = vi.fn();
  for (const a of answers) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(a.body), { status: a.status ?? 200 }));
  }
  return fn;
}

/** @type {import('../../worker/src/validate.ts').TranslateBody} */
const BODY = { text: 'Hi', source: null, target: 'FR', formal: null };
const OK = { body: { translations: [{ text: 'x' }] } };

describe('deeplBaseUrl', () => {
  it('clé :fx → api-free.deepl.com', () => {
    expect(deeplBaseUrl('abc:fx')).toBe('https://api-free.deepl.com');
  });
  it('clé pro → api.deepl.com', () => {
    expect(deeplBaseUrl('abc')).toBe('https://api.deepl.com');
  });
});

describe('translateDeepl', () => {
  it('envoie DeepL-Auth-Key, text[], target_lang', async () => {
    const f = fakeFetch({ body: { translations: [{ text: 'Salut' }] } });
    expect(await translateDeepl('k:fx', BODY, f)).toBe('Salut');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('DeepL-Auth-Key k:fx');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ text: ['Hi'], target_lang: 'FR' });
  });

  it('formal true/false → prefer_more/prefer_less, null → pas de formality', async () => {
    const f = fakeFetch(OK, OK, OK);
    await translateDeepl('k', { ...BODY, formal: true }, f);
    await translateDeepl('k', { ...BODY, formal: false }, f);
    await translateDeepl('k', BODY, f);
    const sent = f.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(sent[0].formality).toBe('prefer_more');
    expect(sent[1].formality).toBe('prefer_less');
    expect(sent[2]).not.toHaveProperty('formality');
  });

  it('source présente → source_lang', async () => {
    const f = fakeFetch(OK, OK);
    await translateDeepl('k', { ...BODY, source: 'EN' }, f);
    await translateDeepl('k', BODY, f);
    expect(JSON.parse(f.mock.calls[0][1].body).source_lang).toBe('EN');
    expect(JSON.parse(f.mock.calls[1][1].body)).not.toHaveProperty('source_lang');
  });

  it('erreur HTTP → "<message> (code 403)"', async () => {
    const f = fakeFetch({ status: 403, body: { message: 'Forbidden' } });
    await expect(translateDeepl('k', BODY, f)).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden (code 403)',
    });
  });

  it('erreur HTTP sans message → "Erreur API DeepL (code 500)"', async () => {
    const f = fakeFetch({ status: 500, body: {} });
    await expect(translateDeepl('k', BODY, f)).rejects.toMatchObject({
      message: 'Erreur API DeepL (code 500)',
    });
  });

  it('fetch qui rejette → "Erreur réseau DeepL : …"', async () => {
    const f = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(translateDeepl('k', BODY, f)).rejects.toMatchObject({
      status: 502,
      message: 'Erreur réseau DeepL : boom',
    });
  });

  it('corps non JSON → "Réponse DeepL invalide : …"', async () => {
    const f = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(translateDeepl('k', BODY, f)).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/^Réponse DeepL invalide : /),
    });
  });

  it('réponse sans translations → "Réponse DeepL sans traduction."', async () => {
    const f = fakeFetch({ body: { translations: [] } });
    await expect(translateDeepl('k', BODY, f)).rejects.toMatchObject({
      status: 502,
      message: 'Réponse DeepL sans traduction.',
    });
  });
});

describe('redirections', () => {
  it('translate et les deux listes de langues passent redirect: "error"', async () => {
    const f = fakeFetch(OK, { body: [] }, { body: [] });
    await translateDeepl('k', BODY, f);
    await deeplLanguages('k', f);
    expect(f.mock.calls.map((c) => c[1].redirect)).toEqual(['error', 'error', 'error']);
  });
});

describe('deeplLanguages', () => {
  it('languages : fusionne source/target, formality false par défaut', async () => {
    const f = fakeFetch(
      { body: [{ language: 'JA', name: 'Japanese' }] },
      {
        body: [
          { language: 'JA', name: 'Japanese', supports_formality: true },
          { language: 'KO', name: 'Korean', supports_formality: false },
          { language: 'ZH-HANS', name: 'Chinese (simplified)' },
        ],
      },
    );
    expect(await deeplLanguages('k:fx', f)).toEqual({
      source: ['JA'],
      target: [
        { code: 'JA', formality: true },
        { code: 'KO', formality: false },
        { code: 'ZH-HANS', formality: false },
      ],
    });
    expect(f.mock.calls[0][0]).toBe('https://api-free.deepl.com/v2/languages?type=source');
    expect(f.mock.calls[1][0]).toBe('https://api-free.deepl.com/v2/languages?type=target');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('DeepL-Auth-Key k:fx');
  });

  it('languages : lance les deux requêtes sans attendre la première réponse', async () => {
    /** @type {((r: Response) => void)[]} */
    const resolvers = [];
    const f = vi.fn(
      () => new Promise((resolve) => {
        resolvers.push(resolve);
      }),
    );
    const pending = deeplLanguages('k', f);
    await Promise.resolve();
    expect(f).toHaveBeenCalledTimes(2);
    for (const resolve of resolvers) resolve(new Response('[]'));
    await expect(pending).resolves.toEqual({ source: [], target: [] });
  });

  it('languages : réponse non liste → "Liste des langues DeepL invalide."', async () => {
    const f = fakeFetch({ body: { message: 'Forbidden' } }, { body: [] });
    await expect(deeplLanguages('k', f)).rejects.toMatchObject({
      status: 502,
      message: 'Liste des langues DeepL invalide.',
    });
  });

  it('languages : erreur HTTP → "<message> (code 403)"', async () => {
    // Both list requests run in parallel, so each one needs its own answer.
    const f = fakeFetch(
      { status: 403, body: { message: 'Forbidden' } },
      { status: 403, body: { message: 'Forbidden' } },
    );
    await expect(deeplLanguages('k', f)).rejects.toMatchObject({ message: 'Forbidden (code 403)' });
  });

  it('languages : fetch qui rejette → "Erreur réseau DeepL : …"', async () => {
    const f = vi.fn().mockRejectedValue(new Error('down'));
    await expect(deeplLanguages('k', f)).rejects.toMatchObject({ message: 'Erreur réseau DeepL : down' });
  });
});
