import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webInvoke } from '@js/web/backend.js';
import { webStoreGet } from '@js/web/storage.js';

vi.mock('@js/web/storage.js', () => ({ webStoreGet: vi.fn() }));

const fetchMock = vi.fn();

/**
 * @param {Record<string, string>} secrets - Stored credentials by setting name.
 */
function stubSecrets(secrets) {
  vi.mocked(webStoreGet).mockImplementation(async (key) => secrets[key] ?? null);
}

/**
 * @param {unknown} body
 * @param {number} [status]
 * @returns {Response}
 */
function jsonReply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Returns the first call made to `fetch`, with its parsed body.
 *
 * @returns {{ url: string, init: RequestInit & { headers: Record<string, string> }, body: Record<string, unknown> }}
 */
function lastCall() {
  const [url, init] = fetchMock.mock.calls[0];
  return { url, init, body: JSON.parse(init.body) };
}

/**
 * @param {Promise<unknown>} promise
 * @returns {Promise<unknown>} The thrown value.
 */
async function thrown(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('did not throw');
}

const ARGS = { text: 'Bonjour', source: 'FR', target: 'EN', formal: true };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  stubSecrets({ deeplKey: 'dk:fx', laraId: 'lid', laraSecret: 'lsec' });
});

describe('webInvoke', () => {
  it('translate_deepl : POST /api/translate/deepl, en-tête X-Deepl-Key, corps { text, source, target, formal }', async () => {
    fetchMock.mockResolvedValue(jsonReply({ translation: 'Hello' }));

    const result = await webInvoke('translate_deepl', ARGS);

    const { url, init, body } = lastCall();
    expect(result).toBe('Hello');
    expect(url).toBe('/api/translate/deepl');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Deepl-Key': 'dk:fx' });
    expect(body).toEqual({ text: 'Bonjour', source: 'FR', target: 'EN', formal: true });
  });

  it('source absente → source: null', async () => {
    fetchMock.mockResolvedValue(jsonReply({ translation: 'x' }));

    await webInvoke('translate_deepl', { text: 'a', target: 'EN' });

    expect(lastCall().body).toEqual({ text: 'a', source: null, target: 'EN', formal: null });
  });

  it('source vide ou absente → null dans le corps', async () => {
    fetchMock.mockImplementation(async () => jsonReply({ translation: 'x' }));

    await webInvoke('translate_deepl', { ...ARGS, source: '' });
    await webInvoke('translate_deepl', { ...ARGS, source: undefined });
    await webInvoke('translate_deepl', { ...ARGS, source: null });

    expect(fetchMock.mock.calls).toHaveLength(3);
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(call[1].body).source).toBeNull();
    }
  });

  it('translate_lara : en-têtes X-Lara-Id et X-Lara-Secret', async () => {
    fetchMock.mockResolvedValue(jsonReply({ translation: 'Hi' }));

    const result = await webInvoke('translate_lara', ARGS);

    const { url, init, body } = lastCall();
    expect(result).toBe('Hi');
    expect(url).toBe('/api/translate/lara');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'X-Lara-Id': 'lid', 'X-Lara-Secret': 'lsec' });
    expect(body).toEqual({ text: 'Bonjour', source: 'FR', target: 'EN', formal: true });
  });

  it('deepl_languages / lara_languages : bonnes routes, corps {}', async () => {
    const deeplLists = { source: ['FR'], target: [{ code: 'EN', formality: false }] };
    fetchMock.mockResolvedValueOnce(jsonReply(deeplLists)).mockResolvedValueOnce(jsonReply(['fr', 'en']));

    const deepl = await webInvoke('deepl_languages');
    const lara = await webInvoke('lara_languages');

    expect(deepl).toEqual(deeplLists);
    expect(lara).toEqual(['fr', 'en']);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/languages/deepl', '/api/languages/lara']);
    expect(fetchMock.mock.calls.map((c) => c[1].body)).toEqual(['{}', '{}']);
    expect(fetchMock.mock.calls[0][1].headers['X-Deepl-Key']).toBe('dk:fx');
    expect(fetchMock.mock.calls[1][1].headers['X-Lara-Id']).toBe('lid');
  });

  it('retire espaces et retours à la ligne des clés avant de les mettre en en-tête', async () => {
    stubSecrets({ deeplKey: 'abc\n def :fx', laraId: ' l\tid\r\n', laraSecret: 's e\ncret' });
    fetchMock.mockImplementation(async () => jsonReply({ translation: 'x' }));

    await webInvoke('translate_deepl', ARGS);
    await webInvoke('translate_lara', ARGS);

    expect(fetchMock.mock.calls[0][1].headers['X-Deepl-Key']).toBe('abcdef:fx');
    expect(fetchMock.mock.calls[1][1].headers['X-Lara-Id']).toBe('lid');
    expect(fetchMock.mock.calls[1][1].headers['X-Lara-Secret']).toBe('secret');
  });

  it('clé absente → lève le texte "Clé API DeepL manquante…" sans appeler fetch', async () => {
    stubSecrets({});

    const err = await thrown(webInvoke('translate_deepl', ARGS));

    expect(err).toBe('Clé API DeepL manquante. Ajoutez-la dans les Paramètres.');
    expect(await thrown(webInvoke('deepl_languages'))).toBe(err);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('identifiants Lara absents (ou incomplets) → lève le texte sans appeler fetch', async () => {
    stubSecrets({ laraId: 'lid' });

    const err = await thrown(webInvoke('translate_lara', ARGS));

    expect(err).toBe('Identifiants Lara manquants. Ajoutez-les dans les Paramètres.');
    expect(await thrown(webInvoke('lara_languages'))).toBe(err);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('réponse { error } → lève ce texte', async () => {
    fetchMock.mockResolvedValue(jsonReply({ error: 'Trop de requêtes, réessayez dans un instant.' }, 429));

    expect(await thrown(webInvoke('translate_lara', ARGS))).toBe('Trop de requêtes, réessayez dans un instant.');
  });

  it('fetch qui rejette → lève "Erreur réseau DeepL : …"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    expect(await thrown(webInvoke('translate_deepl', ARGS))).toBe('Erreur réseau DeepL : Failed to fetch');
    expect(await thrown(webInvoke('lara_languages'))).toBe('Erreur réseau Lara : Failed to fetch');
  });

  it("fetch qui rejette avec autre chose qu'une Error → texte converti", async () => {
    fetchMock.mockRejectedValue('coupé');

    expect(await thrown(webInvoke('translate_deepl', ARGS))).toBe('Erreur réseau DeepL : coupé');
  });

  it("chaque appel a un délai maximal (AbortSignal) pour ne pas laisser l'interface attendre", async () => {
    fetchMock.mockResolvedValue(jsonReply({ translation: 'Hello' }));

    await webInvoke('translate_deepl', ARGS);

    expect(lastCall().init.signal).toBeInstanceOf(AbortSignal);
  });

  it("un message d'erreur du serveur démesuré est tronqué", async () => {
    fetchMock.mockResolvedValue(jsonReply({ error: 'x'.repeat(5000) }, 500));

    const err = /** @type {string} */ (await thrown(webInvoke('translate_deepl', ARGS)));

    expect(err.length).toBeLessThanOrEqual(300);
    expect(err.endsWith('…')).toBe(true);
  });

  it('réponse non JSON → lève "Réponse DeepL invalide : …" sans texte technique anglais', async () => {
    fetchMock.mockImplementation(async () => new Response('<html>oops</html>', { status: 200 }));

    expect(await thrown(webInvoke('translate_deepl', ARGS))).toBe('Réponse DeepL invalide : réponse non JSON (statut 200).');
    expect(await thrown(webInvoke('lara_languages'))).toBe('Réponse Lara invalide : réponse non JSON (statut 200).');
  });

  it('erreur HTTP sans corps { error } → lève "Réponse Lara invalide : …"', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));

    expect(await thrown(webInvoke('translate_lara', ARGS))).toMatch(/^Réponse Lara invalide : .*502/);
  });

  it('traduction absente de la réponse → lève "Réponse DeepL invalide : …"', async () => {
    fetchMock.mockResolvedValue(jsonReply({ foo: 1 }));

    expect(await thrown(webInvoke('translate_deepl', ARGS))).toMatch(/^Réponse DeepL invalide : /);
  });

  it('les clés ne figurent jamais dans l’URL ni le corps', async () => {
    fetchMock.mockImplementation(async () => jsonReply({ translation: 'x' }));

    await webInvoke('translate_deepl', ARGS);
    await webInvoke('translate_lara', ARGS);
    await webInvoke('deepl_languages');
    await webInvoke('lara_languages');

    expect(fetchMock.mock.calls).toHaveLength(4);
    for (const [url, init] of fetchMock.mock.calls) {
      for (const secret of ['dk:fx', 'lid', 'lsec']) {
        expect(url).not.toContain(secret);
        expect(init.body).not.toContain(secret);
      }
    }
  });

  it('commande inconnue → lève', async () => {
    expect(await thrown(webInvoke('format_disk'))).toBe('Commande inconnue : format_disk');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
