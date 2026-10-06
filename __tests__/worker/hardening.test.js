// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../../worker/src/index.ts';
import { errorResponse } from '../../worker/src/errors.ts';

const LANGS = JSON.stringify([{ language: 'EN' }]);

/**
 * @param {import('vitest').Mock} [limit]
 * @returns {{ ASSETS: { fetch: import('vitest').Mock }, RATE_LIMITER?: { limit: import('vitest').Mock } }}
 */
function makeEnv(limit) {
  const env = { ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('asset')) } };
  return limit ? { ...env, RATE_LIMITER: { limit } } : env;
}

/**
 * @param {Record<string, string>} headers
 * @param {string} [method]
 */
function req(headers, method = 'POST') {
  return new Request('https://ponto.test/api/languages/deepl', {
    method,
    headers: { 'X-Deepl-Key': 'k', ...headers },
    body: method === 'GET' ? undefined : '{}',
  });
}

function stubDeepl() {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(LANGS)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('same-origin check', () => {
  it('Origin d\'un autre site → 403', async () => {
    const res = await worker.fetch(req({ Origin: 'https://evil.test' }), makeEnv());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Origine refusée.' });
  });

  it('Origin illisible → 403', async () => {
    const res = await worker.fetch(req({ Origin: 'null' }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('sans Origin ni Sec-Fetch-Site → 403', async () => {
    const res = await worker.fetch(req({}), makeEnv());
    expect(res.status).toBe(403);
  });

  it('Sec-Fetch-Site cross-site → 403', async () => {
    const res = await worker.fetch(req({ 'Sec-Fetch-Site': 'cross-site' }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('Sec-Fetch-Site same-origin → accepté', async () => {
    stubDeepl();
    const res = await worker.fetch(req({ 'Sec-Fetch-Site': 'same-origin' }), makeEnv());
    expect(res.status).toBe(200);
  });

  it.each([
    ['hôte voisin', 'https://ponto.test.evil.test'],
    ['autre port', 'https://ponto.test:8443'],
    ['autre schéma', 'http://ponto.test'],
  ])('Origin avec %s → 403', async (_name, origin) => {
    stubDeepl(); // a wrongly accepted request must not reach the real DeepL
    const res = await worker.fetch(req({ Origin: origin }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('Origin d\'un autre site → 403 même si Sec-Fetch-Site dit same-origin', async () => {
    const res = await worker.fetch(
      req({ Origin: 'https://evil.test', 'Sec-Fetch-Site': 'same-origin' }),
      makeEnv(),
    );
    expect(res.status).toBe(403);
  });

  it('Origin identique → accepté', async () => {
    stubDeepl();
    const res = await worker.fetch(req({ Origin: 'https://ponto.test' }), makeEnv());
    expect(res.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('rate limiter qui refuse → 429 avec le texte attendu', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const res = await worker.fetch(req({ 'Sec-Fetch-Site': 'same-origin' }), makeEnv(limit));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Trop de requêtes, réessayez dans un instant.' });
  });

  it('rate limiter appelé avec l\'IP CF-Connecting-IP', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    await worker.fetch(req({ 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '203.0.113.7' }), makeEnv(limit));
    expect(limit).toHaveBeenCalledWith({ key: '203.0.113.7' });
  });

  it('sans CF-Connecting-IP → clé "anonymous"', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    await worker.fetch(req({ 'Sec-Fetch-Site': 'same-origin' }), makeEnv(limit));
    expect(limit).toHaveBeenCalledWith({ key: 'anonymous' });
  });

  it('origine refusée → le limiteur n\'est pas consommé', async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    await worker.fetch(req({ Origin: 'https://evil.test' }), makeEnv(limit));
    expect(limit).not.toHaveBeenCalled();
  });

  it('limiteur en panne → 500 sans détail, la requête ne part pas chez DeepL (échec fermé)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const limit = vi.fn().mockRejectedValue(new Error('binding indisponible'));
    const res = await worker.fetch(req({ 'Sec-Fetch-Site': 'same-origin' }), makeEnv(limit));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Erreur interne.' });
    expect(f).not.toHaveBeenCalled();
  });

  it('limiteur qui accepte → la requête passe', async () => {
    stubDeepl();
    const limit = vi.fn().mockResolvedValue({ success: true });
    const res = await worker.fetch(req({ 'Sec-Fetch-Site': 'same-origin' }), makeEnv(limit));
    expect(res.status).toBe(200);
  });
});

describe('méthode', () => {
  it('méthode GET sur /api → 405', async () => {
    const limit = vi.fn();
    const res = await worker.fetch(req({}, 'GET'), makeEnv(limit));
    expect(res.status).toBe(405);
    expect(limit).not.toHaveBeenCalled();
  });
});

describe('errorResponse', () => {
  it.each([700, 399, 600, 1.5, Number.NaN, 0, -1])('statut %s → repli sur 502', (status) => {
    expect(errorResponse(status, 'x').status).toBe(502);
  });

  it.each([400, 429, 599])('statut %s conservé', (status) => {
    expect(errorResponse(status, 'x').status).toBe(status);
  });
});

describe('configuration', () => {
  it('wrangler.toml : observability désactivée et nodejs_compat présent', () => {
    const toml = readFileSync('worker/wrangler.toml', 'utf8');
    expect(toml).toMatch(/\[observability\]\s*\r?\nenabled = false/);
    expect(toml).toContain('nodejs_compat');
    expect(toml).toContain('run_worker_first = ["/api/*"]');
  });

  it('aucun appel console.* dans worker/src (sous-dossiers compris)', () => {
    const files = readdirSync('worker/src', { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => `${entry.parentPath}/${entry.name}`);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/console\.\w+/);
    }
  });
});
