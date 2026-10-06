import { createHash } from 'node:crypto';
import { ApiError, errorText, redactor, type Json } from './errors.ts';
import type { TranslateBody } from './validate.ts';

const BASE_URL = 'https://api.laratranslate.com';
const SDK_NAME = 'ponto-web';
const LARA_SDK_VERSION = '1.0.0';
const LARA_FORMAL = 'Use the formal, polite register.';
const LARA_INFORMAL = 'Use the informal, familiar register.';
const MAX_CACHED_TOKENS = 100;

export interface LaraCredentials {
  id: string;
  secret: string;
}

// Tokens keyed by SHA-256(id + "\n" + secret): a token is never reused without its secret.
const tokenCache = new Map<string, string>();

export function clearLaraTokenCache(): void {
  tokenCache.clear();
}

function cacheKey(creds: LaraCredentials): string {
  return createHash('sha256').update(`${creds.id}\n${creds.secret}`).digest('hex');
}

function cacheToken(key: string, token: string): void {
  tokenCache.delete(key);
  tokenCache.set(key, token);
  if (tokenCache.size > MAX_CACHED_TOKENS) {
    const oldest = tokenCache.keys().next().value;
    if (oldest !== undefined) tokenCache.delete(oldest);
  }
}

// MD5 is mandated by Lara's request signing scheme, not used for security here.
export function contentMd5(body: string): string {
  return createHash('md5').update(body).digest('base64');
}

export async function signLara(
  secret: string,
  method: string,
  path: string,
  md5: string,
  contentType: string,
  date: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const challenge = `${method}\n${path}\n${md5}\n${contentType}\n${date}`;
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(challenge));
  return Buffer.from(mac).toString('base64');
}

function apiError(status: number, body: unknown): string {
  const message = (body as { message?: unknown } | null)?.message;
  const msg = typeof message === 'string' ? message : 'erreur inconnue';
  return status === 401 || status === 403
    ? `Identifiants Lara refusés (${status}) : ${msg}`
    : `Erreur API Lara (${status}) : ${msg}`;
}

function errorStatus(status: number): number {
  return status >= 400 ? status : 502;
}

async function authenticate(creds: LaraCredentials, fetchFn: typeof fetch): Promise<string> {
  const fail = redactor(creds.id, creds.secret);
  const body = JSON.stringify({ id: creds.id });
  const date = new Date().toUTCString();
  const md5 = contentMd5(body);
  const signature = await signLara(creds.secret, 'POST', '/v2/auth', md5, 'application/json', date);

  let res: Response;
  try {
    res = await fetchFn(`${BASE_URL}/v2/auth`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-Lara-Date': date,
        'Content-MD5': md5,
        Authorization: `Lara:${signature}`,
      },
      body,
    });
  } catch (e) {
    throw fail(502, `Erreur réseau Lara : ${errorText(e)}`);
  }

  let data: Json;
  try {
    data = (await res.json()) as Json;
  } catch (e) {
    throw fail(502, `Réponse d'authentification Lara invalide : ${errorText(e)}`);
  }
  const token = (data as { token?: unknown } | null)?.token;
  const redactToken = redactor(creds.id, creds.secret, typeof token === 'string' ? token : '');
  if (!res.ok) throw redactToken(errorStatus(res.status), apiError(res.status, data));
  if (typeof token !== 'string') throw fail(502, 'Réponse d\'authentification Lara sans jeton.');
  return token;
}

/** One authorized call; returns null on a 401 (the caller re-authenticates). */
async function callOnce(
  creds: LaraCredentials,
  token: string,
  method: string,
  path: string,
  body: string | undefined,
  fetchFn: typeof fetch,
): Promise<Json | undefined | null> {
  const fail = redactor(creds.id, creds.secret, token);
  const headers: Record<string, string> = {
    'X-Lara-Date': new Date().toUTCString(),
    'X-Lara-SDK-Name': SDK_NAME,
    'X-Lara-SDK-Version': LARA_SDK_VERSION,
    Authorization: `Bearer ${token}`,
  };
  const init: RequestInit = { method, redirect: 'error', headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = body;
  }

  let res: Response;
  let raw: string;
  try {
    res = await fetchFn(`${BASE_URL}${path}`, init);
    raw = await res.text();
  } catch (e) {
    throw fail(502, `Erreur réseau Lara : ${errorText(e)}`);
  }

  // The API may answer in NDJSON: the last valid JSON line carries the final status and data.
  let last: Record<string, unknown> | undefined;
  for (const line of raw.split('\n').reverse()) {
    try {
      const parsed: unknown = JSON.parse(line.trim());
      if (typeof parsed === 'object' && parsed !== null) {
        last = parsed as Record<string, unknown>;
        break;
      }
    } catch {
      // not JSON: try the previous line
    }
  }
  if (!last) throw fail(502, `Réponse Lara vide (code ${res.status}).`);

  const status = typeof last.status === 'number' ? last.status : res.status;
  if (status === 401) return null;
  const payload = (last.data ?? last) as Json;
  if (status < 200 || status >= 300) throw fail(errorStatus(status), apiError(status, payload));
  return payload;
}

async function authorized(
  creds: LaraCredentials,
  method: string,
  path: string,
  body: string | undefined,
  fetchFn: typeof fetch,
): Promise<Json | undefined> {
  const key = cacheKey(creds);
  const cached = tokenCache.get(key);
  const token = cached ?? (await authenticate(creds, fetchFn));

  const first = await callOnce(creds, token, method, path, body, fetchFn);
  if (first !== null) {
    cacheToken(key, token);
    return first;
  }

  // Refused token: never keep it, even if the re-authentication below fails.
  tokenCache.delete(key);
  const fresh = await authenticate(creds, fetchFn);
  const second = await callOnce(creds, fresh, method, path, body, fetchFn);
  if (second === null) {
    tokenCache.delete(key);
    throw new ApiError(401, 'Lara refuse le jeton d\'authentification (401).');
  }
  cacheToken(key, fresh);
  return second;
}

export async function translateLara(
  creds: LaraCredentials,
  body: TranslateBody,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const payload: Record<string, unknown> = { q: body.text, target: body.target };
  if (body.source !== null) payload.source = body.source;
  if (body.formal !== null) payload.instructions = [body.formal ? LARA_FORMAL : LARA_INFORMAL];

  const data = await authorized(creds, 'POST', '/v2/translate', JSON.stringify(payload), fetchFn);
  const translation = (data as { translation?: unknown } | null)?.translation;
  if (typeof translation !== 'string') throw new ApiError(502, 'Réponse Lara sans traduction.');
  return translation;
}

export async function laraLanguages(creds: LaraCredentials, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const data = await authorized(creds, 'GET', '/v2/languages', undefined, fetchFn);
  if (!Array.isArray(data)) throw new ApiError(502, 'Liste des langues Lara invalide.');
  return data.filter((code): code is string => typeof code === 'string');
}
