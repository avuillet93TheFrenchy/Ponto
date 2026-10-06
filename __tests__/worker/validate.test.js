// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  MAX_TEXT_CHARS,
  parseTranslateBody,
  readJsonBody,
  requireHeader,
} from '../../worker/src/validate.ts';
import { ApiError } from '../../worker/src/errors.ts';

/**
 * Returns the ApiError thrown by a function.
 * @param {() => unknown} fn
 * @returns {ApiError}
 */
function thrown(fn) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return /** @type {ApiError} */ (e);
  }
  throw new Error('no error thrown');
}

describe('parseTranslateBody', () => {
  it('refuse un texte vide ou blanc', () => {
    for (const text of ['', '   \n\t']) {
      const err = thrown(() => parseTranslateBody({ text, target: 'FR' }));
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/^Requête invalide : /);
    }
  });

  it('refuse un texte de 10001 caractères', () => {
    const err = thrown(() => parseTranslateBody({ text: 'a'.repeat(MAX_TEXT_CHARS + 1), target: 'FR' }));
    expect(err.status).toBe(413);
    expect(err.message).toMatch(/^Requête invalide : /);
  });

  it('accepte 10000 caractères, emoji et retours à la ligne', () => {
    const text = 'a\r\nb\n😀'.padEnd(MAX_TEXT_CHARS, 'x');
    expect(text).toHaveLength(MAX_TEXT_CHARS);
    const body = parseTranslateBody({ text, source: 'EN', target: 'FR', formal: true });
    expect(body).toEqual({ text, source: 'EN', target: 'FR', formal: true });
  });

  it('refuse un code de langue invalide', () => {
    expect(thrown(() => parseTranslateBody({ text: 'a', target: 'fr; DROP' })).status).toBe(400);
    expect(thrown(() => parseTranslateBody({ text: 'a', source: 'fr; DROP', target: 'FR' })).status).toBe(400);
  });

  it('source vide refusée (400) : le client doit envoyer null pour la détection', () => {
    expect(thrown(() => parseTranslateBody({ text: 'a', source: '', target: 'FR' })).status).toBe(400);
  });

  it('source absente = détection', () => {
    expect(parseTranslateBody({ text: 'a', target: 'zh-CN' })).toEqual({
      text: 'a', source: null, target: 'zh-CN', formal: null,
    });
    expect(parseTranslateBody({ text: 'a', source: null, target: 'FR' }).source).toBeNull();
  });

  it('refuse un corps qui n\'est pas un objet ou un formal non booléen', () => {
    expect(thrown(() => parseTranslateBody(null)).status).toBe(400);
    expect(thrown(() => parseTranslateBody({ text: 5, target: 'FR' })).status).toBe(400);
    expect(thrown(() => parseTranslateBody({ text: 'a', target: 'FR', formal: 'oui' })).status).toBe(400);
  });
});

describe('readJsonBody', () => {
  it('lit un JSON valide', async () => {
    const req = new Request('https://x.test/', { method: 'POST', body: '{"a":1}' });
    expect(await readJsonBody(req)).toEqual({ a: 1 });
  });

  it('refuse un JSON invalide (400)', async () => {
    const req = new Request('https://x.test/', { method: 'POST', body: '{nope' });
    await expect(readJsonBody(req)).rejects.toMatchObject({ status: 400 });
  });

  it('refuse dès l\'en-tête Content-Length trop grand (413), sans lire le corps', async () => {
    const req = new Request('https://ponto.test/api/x', {
      method: 'POST',
      headers: { 'Content-Length': '70000' },
      body: '{}',
    });
    const spy = vi.spyOn(req.body ?? new ReadableStream(), 'getReader');
    await expect(readJsonBody(req)).rejects.toMatchObject({ status: 413 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuse un corps de plus de 64 Ko (413)', async () => {
    const req = new Request('https://x.test/', { method: 'POST', body: 'a'.repeat(64 * 1024 + 1) });
    await expect(readJsonBody(req)).rejects.toMatchObject({ status: 413 });
  });
});

describe('requireHeader', () => {
  it('requireHeader retire les espaces et signale l\'absence', () => {
    const req = new Request('https://x.test/', { headers: { 'X-K': '  abc  ' } });
    expect(requireHeader(req, 'X-K', 'manquant')).toBe('abc');
    const err = thrown(() => requireHeader(req, 'X-Absent', 'manquant'));
    expect(err.status).toBe(401);
    expect(err.message).toBe('manquant');
    const blank = new Request('https://x.test/', { headers: { 'X-K': '   ' } });
    expect(thrown(() => requireHeader(blank, 'X-K', 'manquant')).status).toBe(401);
  });
});
