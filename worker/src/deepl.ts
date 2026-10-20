import { ApiError, errorText, redactor, type Json } from './errors.ts';
import type { TranslateBody } from './validate.ts';

export function deeplBaseUrl(key: string): string {
  return key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

/** Calls DeepL and returns the parsed JSON, or throws an ApiError carrying the French message. */
async function call(key: string, url: string, init: RequestInit, fetchFn: typeof fetch): Promise<Json> {
  const fail = redactor(key);
  const headers = { ...(init.headers as Record<string, string>), Authorization: `DeepL-Auth-Key ${key}` };

  let res: Response;
  try {
    res = await fetchFn(url, { ...init, headers, redirect: 'error' });
  } catch (e) {
    throw fail(502, `Erreur réseau DeepL : ${errorText(e)}`);
  }

  let data: Json;
  try {
    data = (await res.json()) as Json;
  } catch (e) {
    throw fail(502, `Réponse DeepL invalide : ${errorText(e)}`);
  }

  if (!res.ok) {
    const message = (data as Record<string, unknown> | null)?.message;
    const text = typeof message === 'string' ? message : 'Erreur API DeepL';
    throw fail(res.status >= 400 ? res.status : 502, `${text} (code ${res.status})`);
  }
  return data;
}

export async function translateDeepl(
  key: string,
  body: TranslateBody,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const payload: Record<string, unknown> = { text: [body.text], target_lang: body.target };
  if (body.source !== null) payload.source_lang = body.source;
  if (body.formal !== null) payload.formality = body.formal ? 'prefer_more' : 'prefer_less';

  const data = await call(
    key,
    `${deeplBaseUrl(key)}/v2/translate`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    fetchFn,
  );
  const translations = (data as { translations?: unknown } | null)?.translations;
  const text = Array.isArray(translations) ? (translations[0] as { text?: unknown } | undefined)?.text : undefined;
  if (typeof text !== 'string') throw new ApiError(502, 'Réponse DeepL sans traduction.');
  return text;
}

export async function deeplLanguages(
  key: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ source: string[]; target: { code: string; formality: boolean }[] }> {
  const list = (type: string) =>
    call(key, `${deeplBaseUrl(key)}/v2/languages?type=${type}`, { method: 'GET' }, fetchFn);
  const [source, target] = await Promise.all([list('source'), list('target')]);
  if (!Array.isArray(source) || !Array.isArray(target)) {
    throw new ApiError(502, 'Liste des langues DeepL invalide.');
  }
  const code = (v: unknown): string | undefined => {
    const c = (v as { language?: unknown } | null)?.language;
    return typeof c === 'string' ? c : undefined;
  };
  return {
    source: source.flatMap((v) => code(v) ?? []),
    target: target.flatMap((v) => {
      const c = code(v);
      if (c === undefined) return [];
      return [{ code: c, formality: (v as { supports_formality?: unknown }).supports_formality === true }];
    }),
  };
}
