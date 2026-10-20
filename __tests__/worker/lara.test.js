// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  clearLaraTokenCache,
  contentMd5,
  laraLanguages,
  signLara,
  translateLara,
} from '../../worker/src/lara.ts';
import worker from '../../worker/src/index.ts';

/**
 * Builds a fake fetch answering with the given raw bodies in order.
 * @param {...{ status?: number, body: unknown }} answers
 */
function fakeFetch(...answers) {
  const fn = vi.fn();
  for (const a of answers) {
    const raw = typeof a.body === 'string' ? a.body : JSON.stringify(a.body);
    fn.mockResolvedValueOnce(new Response(raw, { status: a.status ?? 200 }));
  }
  return fn;
}

/** @type {import('../../worker/src/lara.ts').LaraCredentials} */
const CREDS = { id: 'lara-id', secret: 'lara-secret' };
/** @type {import('../../worker/src/validate.ts').TranslateBody} */
const BODY = { text: 'Hi', source: null, target: 'fr-FR', formal: null };
const AUTH = { body: { token: 'tok-1' } };
const OK = { body: { status: 200, data: { translation: 'Salut' } } };

beforeEach(() => {
  clearLaraTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('contentMd5 / signLara', () => {
  it('contentMd5 = base64 du MD5 du corps', () => {
    const body = '{"id":"x"}';
    expect(contentMd5(body)).toBe(createHash('md5').update(body).digest('base64'));
    expect(contentMd5('{"id":"abc"}')).toBe('MeRXbpZYPnWCqmRZ/pCiHA==');
  });

  it('signLara signe "méthode\\nchemin\\nmd5\\ncontent-type\\ndate" en HMAC-SHA256 base64', async () => {
    const date = 'Thu, 24 Sep 2026 10:00:00 GMT';
    const challenge = `POST\n/v2/auth\nMD5\napplication/json\n${date}`;
    const expected = createHmac('sha256', 'secret').update(challenge).digest('base64');
    expect(await signLara('secret', 'POST', '/v2/auth', 'MD5', 'application/json', date)).toBe(expected);
    expect(
      await signLara('secret', 'POST', '/v2/auth', 'MeRXbpZYPnWCqmRZ/pCiHA==', 'application/json', date),
    ).toBe('TwcmZbAllFkUUGpJ/N/cbkRt8cpCdnKZVmycvGQhbdQ=');
  });
});

describe('translateLara', () => {
  it('authentifie via POST /v2/auth avec Authorization "Lara:<signature>", X-Lara-Date, Content-MD5', async () => {
    const f = fakeFetch(AUTH, OK);
    await translateLara(CREDS, BODY, f);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.laratranslate.com/v2/auth');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ id: 'lara-id' }));
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['Content-MD5']).toBe(contentMd5(init.body));
    const date = init.headers['X-Lara-Date'];
    const signature = await signLara('lara-secret', 'POST', '/v2/auth', init.headers['Content-MD5'], 'application/json', date);
    expect(init.headers.Authorization).toBe(`Lara:${signature}`);
  });

  it('traduit avec Bearer, body { q, target }, source si fournie, instructions formelle/familière', async () => {
    const f = fakeFetch(AUTH, OK, OK, OK);
    expect(await translateLara(CREDS, BODY, f)).toBe('Salut');
    await translateLara(CREDS, { ...BODY, source: 'en-US', formal: true }, f);
    await translateLara(CREDS, { ...BODY, formal: false }, f);

    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://api.laratranslate.com/v2/translate');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Lara-SDK-Name']).toBe('ponto-web');
    expect(init.headers['X-Lara-SDK-Version']).toBe('1.0.0');
    expect(typeof init.headers['X-Lara-Date']).toBe('string');
    expect(JSON.parse(init.body)).toEqual({ q: 'Hi', target: 'fr-FR' });

    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({
      q: 'Hi',
      target: 'fr-FR',
      source: 'en-US',
      instructions: ['Use the formal, polite register.'],
    });
    expect(JSON.parse(f.mock.calls[3][1].body)).toEqual({
      q: 'Hi',
      target: 'fr-FR',
      instructions: ['Use the informal, familiar register.'],
    });
  });

  it('lit la dernière ligne JSON valide d\'une réponse NDJSON', async () => {
    const ndjson = [
      JSON.stringify({ status: 200, data: { translation: 'partiel' } }),
      JSON.stringify({ status: 200, data: { translation: 'final' } }),
      '',
      'pas du json',
    ].join('\n');
    const f = fakeFetch(AUTH, { body: ndjson });
    expect(await translateLara(CREDS, BODY, f)).toBe('final');
  });

  it('401 → réauthentifie une seule fois puis réessaie', async () => {
    const f = fakeFetch(AUTH, { body: { status: 401 } }, { body: { token: 'tok-2' } }, OK);
    expect(await translateLara(CREDS, BODY, f)).toBe('Salut');
    expect(f).toHaveBeenCalledTimes(4);
    expect(f.mock.calls[3][1].headers.Authorization).toBe('Bearer tok-2');
  });

  it('deuxième 401 → "Lara refuse le jeton d\'authentification (401)."', async () => {
    const f = fakeFetch(AUTH, { body: { status: 401 } }, { body: { token: 'tok-2' } }, { status: 401, body: {} });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 401,
      message: 'Lara refuse le jeton d\'authentification (401).',
    });
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('erreur 401/403 d\'auth → "Identifiants Lara refusés (401) : …"', async () => {
    const f = fakeFetch({ status: 401, body: { message: 'Bad signature' } });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 401,
      message: 'Identifiants Lara refusés (401) : Bad signature',
    });
  });

  it('autre erreur → "Erreur API Lara (500) : …"', async () => {
    const f = fakeFetch(AUTH, { status: 500, body: { message: 'Oops' } });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 500,
      message: 'Erreur API Lara (500) : Oops',
    });
  });

  it('fetch qui rejette → "Erreur réseau Lara : …"', async () => {
    const f = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 502,
      message: 'Erreur réseau Lara : boom',
    });
  });

  it('réponse sans traduction → "Réponse Lara sans traduction."', async () => {
    const f = fakeFetch(AUTH, { body: { status: 200, data: {} } });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 502,
      message: 'Réponse Lara sans traduction.',
    });
  });

  it('réponse vide → "Réponse Lara vide (code 200)."', async () => {
    const f = fakeFetch(AUTH, { body: '' });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      message: 'Réponse Lara vide (code 200).',
    });
  });

  it('authentification sans jeton → erreur 502', async () => {
    const f = fakeFetch({ body: {} });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 502,
      message: 'Réponse d\'authentification Lara sans jeton.',
    });
  });

  it('authentification non JSON → "Réponse d\'authentification Lara invalide : …"', async () => {
    const f = fakeFetch({ body: '<html>' });
    await expect(translateLara(CREDS, BODY, f)).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/^Réponse d'authentification Lara invalide : /),
    });
  });

  it('réutilise le jeton : deux traductions = une seule authentification', async () => {
    const f = fakeFetch(AUTH, OK, OK);
    await translateLara(CREDS, BODY, f);
    await translateLara(CREDS, BODY, f);
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls.filter((c) => c[0].endsWith('/v2/auth'))).toHaveLength(1);
  });

  it('même id mais autre secret → nouvelle authentification', async () => {
    const f = fakeFetch(AUTH, OK, { body: { token: 'tok-other' } }, OK);
    await translateLara(CREDS, BODY, f);
    await translateLara({ id: CREDS.id, secret: 'another-secret' }, BODY, f);
    expect(f.mock.calls.filter((c) => c[0].endsWith('/v2/auth'))).toHaveLength(2);
    expect(f.mock.calls[3][1].headers.Authorization).toBe('Bearer tok-other');
  });

  it('un jeton refusé (401) est retiré du cache même si la réauthentification échoue', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(AUTH.body)))
      .mockResolvedValueOnce(new Response(JSON.stringify(OK.body)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 401, data: {} })))
      .mockRejectedValueOnce(new Error('réseau coupé'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'tok-2' })))
      .mockResolvedValueOnce(new Response(JSON.stringify(OK.body)));
    await translateLara(CREDS, BODY, f); // authentifie (tok-1) puis traduit
    await expect(translateLara(CREDS, BODY, f)).rejects.toThrow(); // 401 puis échec réseau
    await translateLara(CREDS, BODY, f); // ne doit pas reprendre tok-1 : réauthentifie
    expect(f.mock.calls.filter((c) => c[0].endsWith('/v2/auth'))).toHaveLength(3);
    expect(f.mock.calls[5][1].headers.Authorization).toBe('Bearer tok-2');
  });

  it('un secret qui contient l\'id est entièrement expurgé', async () => {
    const creds = { id: 'abc', secret: 'abcdefghij' }; // fake test values, vibe-guardian: ignore
    const f = fakeFetch({ status: 403, body: { message: `echo ${creds.secret}` } });
    const error = await translateLara(creds, BODY, f).catch((e) => e);
    expect(error.message).not.toContain('defghij');
    expect(error.message).toContain('***');
  });

  it('le cache est borné à 100 entrées (la plus ancienne est évincée)', async () => {
    const f = vi.fn().mockImplementation(async (/** @type {string} */ url) =>
      new Response(JSON.stringify(url.endsWith('/v2/auth') ? { token: 't' } : OK.body)),
    );
    for (let i = 0; i < 101; i++) await translateLara({ id: `id${i}`, secret: 's' }, BODY, f);
    f.mockClear();
    await translateLara({ id: 'id100', secret: 's' }, BODY, f); // récent : en cache
    expect(f).toHaveBeenCalledTimes(1);
    f.mockClear();
    await translateLara({ id: 'id0', secret: 's' }, BODY, f); // évincé : réauthentifie
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('tous les appels amont passent redirect: "error"', async () => {
    const f = fakeFetch(AUTH, OK);
    await translateLara(CREDS, BODY, f);
    expect(f.mock.calls[0][1].redirect).toBe('error');
    expect(f.mock.calls[1][1].redirect).toBe('error');
  });

  it('un message d\'erreur amont ne contient ni id, ni secret, ni jeton', async () => {
    const f = fakeFetch(AUTH, { status: 500, body: { message: 'echo lara-id lara-secret tok-1' } });
    const err = await translateLara(CREDS, BODY, f).catch((e) => e);
    expect(err.message).not.toMatch(/lara-id|lara-secret|tok-1/);
    expect(err.message).toContain('***');
  });
});

describe('laraLanguages', () => {
  it('languages : tableau de locales (GET /v2/languages)', async () => {
    const f = fakeFetch(AUTH, { body: { status: 200, data: ['ja-JP', 'zh-CN', 42] } });
    expect(await laraLanguages(CREDS, f)).toEqual(['ja-JP', 'zh-CN']);
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://api.laratranslate.com/v2/languages');
    expect(init.method).toBe('GET');
    expect(init).not.toHaveProperty('body');
    expect(init.redirect).toBe('error');
  });

  it('languages : sinon "Liste des langues Lara invalide."', async () => {
    const f = fakeFetch(AUTH, { body: { status: 200, data: { message: 'x' } } });
    await expect(laraLanguages(CREDS, f)).rejects.toMatchObject({
      status: 502,
      message: 'Liste des langues Lara invalide.',
    });
  });
});

describe('Worker router (Lara)', () => {
  const ID = 'router-id-123';
  const SECRET = 'router-secret-456';
  const TOKEN = 'router-token-789';
  const env = { ASSETS: { fetch: vi.fn() } };

  /**
   * @param {string} path
   * @param {Record<string, string>} headers
   * @param {unknown} body
   */
  function req(path, headers, body) {
    return new Request(`https://ponto.test${path}`, {
      method: 'POST',
      headers: { 'Sec-Fetch-Site': 'same-origin', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('clés Lara absentes → 401 "Identifiants Lara manquants…"', async () => {
    for (const path of ['/api/translate/lara', '/api/languages/lara']) {
      const res = await worker.fetch(req(path, { 'X-Lara-Id': ID }, { text: 'Hi', target: 'fr-FR' }), env);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/^Identifiants Lara manquants/);
    }
  });

  it('POST /api/translate/lara renvoie { translation }', async () => {
    vi.stubGlobal('fetch', fakeFetch({ body: { token: TOKEN } }, OK));
    const res = await worker.fetch(
      req('/api/translate/lara', { 'X-Lara-Id': ` ${ID} `, 'X-Lara-Secret': SECRET }, { text: 'Hi', target: 'fr-FR' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translation: 'Salut' });
  });

  it('POST /api/languages/lara renvoie un tableau', async () => {
    vi.stubGlobal('fetch', fakeFetch({ body: { token: TOKEN } }, { body: { status: 200, data: ['ja-JP'] } }));
    const res = await worker.fetch(req('/api/languages/lara', { 'X-Lara-Id': ID, 'X-Lara-Secret': SECRET }, {}), env);
    expect(await res.json()).toEqual(['ja-JP']);
  });

  it('requête invalide → 400 avant tout appel Lara', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(
      req('/api/translate/lara', { 'X-Lara-Id': ID, 'X-Lara-Secret': SECRET }, { text: ' ', target: 'fr-FR' }),
      env,
    );
    expect(res.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it('ni id, ni secret, ni jeton n\'apparaissent dans une erreur d\'authentification', async () => {
    const echo = `echo ${ID} ${SECRET} ${TOKEN}`;
    vi.stubGlobal('fetch', fakeFetch({ status: 403, body: { message: echo, token: TOKEN } }));
    const res = await worker.fetch(
      req('/api/translate/lara', { 'X-Lara-Id': ID, 'X-Lara-Secret': SECRET }, { text: 'Hi', target: 'fr-FR' }),
      env,
    );
    expect(res.status).toBe(403);
    const text = await res.text();
    for (const secret of [ID, SECRET, TOKEN]) expect(text).not.toContain(secret);
    expect(text).toContain('***');
  });

  it('ni id, ni secret, ni jeton n\'apparaissent dans une erreur de traduction', async () => {
    const echo = `echo ${ID} ${SECRET} ${TOKEN}`;
    vi.stubGlobal('fetch', fakeFetch({ body: { token: TOKEN } }, { status: 500, body: { message: echo } }));
    const res = await worker.fetch(
      req('/api/translate/lara', { 'X-Lara-Id': ID, 'X-Lara-Secret': SECRET }, { text: 'Hi', target: 'fr-FR' }),
      env,
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    for (const secret of [ID, SECRET, TOKEN]) expect(text).not.toContain(secret);
    expect(text).toContain('***');
  });

  it('ni id, ni secret, ni jeton n\'apparaissent dans une erreur de /api/languages/lara', async () => {
    vi.stubGlobal('fetch', fakeFetch({ body: { token: TOKEN } }, { status: 500, body: { message: `echo ${ID} ${SECRET} ${TOKEN}` } }));
    const res = await worker.fetch(req('/api/languages/lara', { 'X-Lara-Id': ID, 'X-Lara-Secret': SECRET }, {}), env);
    expect(res.status).toBe(500);
    const text = await res.text();
    for (const secret of [ID, SECRET, TOKEN]) expect(text).not.toContain(secret);
    expect(text).toContain('***');
  });

  it('ni id, ni secret, ni jeton n\'apparaissent dans une erreur réseau', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(`down ${ID} ${SECRET}`)));
    const res = await worker.fetch(
      req('/api/translate/lara', { 'X-Lara-Id': ID, 'X-Lara-Secret': SECRET }, { text: 'Hi', target: 'fr-FR' }),
      env,
    );
    const text = await res.text();
    for (const secret of [ID, SECRET]) expect(text).not.toContain(secret);
  });
});
