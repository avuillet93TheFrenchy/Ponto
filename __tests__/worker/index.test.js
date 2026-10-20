// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../../worker/src/index.ts';

const KEY = 'secret-key-123:fx';

/** @returns {{ ASSETS: { fetch: import('vitest').Mock } }} */
function makeEnv() {
  return { ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('asset')) } };
}

/**
 * @param {string} path
 * @param {{ method?: string, headers?: Record<string, string>, body?: unknown }} [opts]
 */
function req(path, opts = {}) {
  const { method = 'POST', headers = {}, body = {} } = opts;
  return new Request(`https://ponto.test${path}`, {
    method,
    headers: { 'Sec-Fetch-Site': 'same-origin', ...headers },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Worker router', () => {
  it('POST /api/translate/deepl renvoie { translation }', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ translations: [{ text: 'Salut' }] })));
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(
      req('/api/translate/deepl', { headers: { 'X-Deepl-Key': ` ${KEY} ` }, body: { text: 'Hi', target: 'FR' } }),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ translation: 'Salut' });
    expect(f.mock.calls[0][0]).toBe('https://api-free.deepl.com/v2/translate');
  });

  it('POST /api/languages/deepl renvoie les langues', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ language: 'EN' }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ language: 'FR', supports_formality: true }])));
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(req('/api/languages/deepl', { headers: { 'X-Deepl-Key': KEY } }), makeEnv());
    expect(await res.json()).toEqual({ source: ['EN'], target: [{ code: 'FR', formality: true }] });
  });

  it('clé absente → 401 "Clé API DeepL manquante…"', async () => {
    const res = await worker.fetch(req('/api/translate/deepl', { body: { text: 'Hi', target: 'FR' } }), makeEnv());
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/^Clé API DeepL manquante/);
  });

  it('GET /api/translate/deepl → 405', async () => {
    const res = await worker.fetch(req('/api/translate/deepl', { method: 'GET' }), makeEnv());
    expect(res.status).toBe(405);
    expect((await res.json()).error).toMatch(/^Requête invalide : /);
  });

  it('requête invalide → 400 avant tout appel DeepL', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(
      req('/api/translate/deepl', { headers: { 'X-Deepl-Key': KEY }, body: { text: ' ', target: 'FR' } }),
      makeEnv(),
    );
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('route /api inconnue → 404', async () => {
    const res = await worker.fetch(req('/api/nope'), makeEnv());
    expect(res.status).toBe(404);
    expect(typeof (await res.json()).error).toBe('string');
  });

  it('hors /api → ASSETS.fetch', async () => {
    const env = makeEnv();
    const r = new Request('https://ponto.test/index.html');
    const res = await worker.fetch(r, env);
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(r);
    expect(await res.text()).toBe('asset');
  });

  it('la clé n\'apparaît jamais dans une réponse d\'erreur', async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: `Bad key ${KEY}` }), { status: 403 }),
    );
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(
      req('/api/translate/deepl', { headers: { 'X-Deepl-Key': KEY }, body: { text: 'Hi', target: 'FR' } }),
      makeEnv(),
    );
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(text).toContain('***');
  });

  it('la clé n\'apparaît pas dans une erreur réseau', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`fail ${KEY}`)));
    const res = await worker.fetch(
      req('/api/translate/deepl', { headers: { 'X-Deepl-Key': KEY }, body: { text: 'Hi', target: 'FR' } }),
      makeEnv(),
    );
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    expect(text).toContain('***');
  });

  it('exception inattendue → 500 "Erreur interne." sans détail', async () => {
    const env = makeEnv();
    env.ASSETS.fetch.mockRejectedValue(new Error('secret detail'));
    const res = await worker.fetch(new Request('https://ponto.test/'), env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Erreur interne.' });
  });
});
