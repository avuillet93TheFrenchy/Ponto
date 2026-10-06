import { deeplLanguages, translateDeepl } from './deepl.ts';
import type { Env } from './env.ts';
import { ApiError, errorResponse, jsonResponse } from './errors.ts';
import { laraLanguages, translateLara, type LaraCredentials } from './lara.ts';
import { checkSameOrigin, parseTranslateBody, readJsonBody, requireHeader } from './validate.ts';

type Handler = (req: Request, env: Env) => Promise<Response>;

const DEEPL_KEY_MISSING = 'Clé API DeepL manquante. Ajoutez-la dans les Paramètres.';

const LARA_KEYS_MISSING = 'Identifiants Lara manquants. Ajoutez-les dans les Paramètres.';

function laraCredentials(req: Request): LaraCredentials {
  return {
    id: requireHeader(req, 'X-Lara-Id', LARA_KEYS_MISSING),
    secret: requireHeader(req, 'X-Lara-Secret', LARA_KEYS_MISSING),
  };
}

const routes: Record<string, Handler> = {
  '/api/translate/deepl': async (req) => {
    const key = requireHeader(req, 'X-Deepl-Key', DEEPL_KEY_MISSING);
    const body = parseTranslateBody(await readJsonBody(req));
    return jsonResponse({ translation: await translateDeepl(key, body) });
  },
  '/api/languages/deepl': async (req) => {
    const key = requireHeader(req, 'X-Deepl-Key', DEEPL_KEY_MISSING);
    return jsonResponse(await deeplLanguages(key));
  },
  '/api/translate/lara': async (req) => {
    const creds = laraCredentials(req);
    const body = parseTranslateBody(await readJsonBody(req));
    return jsonResponse({ translation: await translateLara(creds, body) });
  },
  '/api/languages/lara': async (req) => jsonResponse(await laraLanguages(laraCredentials(req))),
};

async function handle(req: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname !== '/api' && !pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

  const handler = Object.hasOwn(routes, pathname) ? routes[pathname] : undefined;
  if (!handler) throw new ApiError(404, 'Route inconnue.');
  if (req.method !== 'POST') throw new ApiError(405, 'Requête invalide : méthode non autorisée.');
  checkSameOrigin(req);
  if (env.RATE_LIMITER) {
    const key = req.headers.get('CF-Connecting-IP') ?? 'anonymous';
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) throw new ApiError(429, 'Trop de requêtes, réessayez dans un instant.');
  }
  return handler(req, env);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.message);
      return errorResponse(500, 'Erreur interne.');
    }
  },
};
