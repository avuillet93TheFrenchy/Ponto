import { ApiError } from './errors.ts';

// Same value as MAX_CHARS in src/main.js.
export const MAX_TEXT_CHARS = 10000;
const MAX_BODY_BYTES = 64 * 1024;
const LANG_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export interface TranslateBody {
  text: string;
  source: string | null;
  target: string;
  formal: boolean | null;
}

function invalid(detail: string, status = 400): ApiError {
  return new ApiError(status, `Requête invalide : ${detail}`);
}

function langCode(value: unknown, field: string): string {
  if (typeof value !== 'string' || !LANG_CODE.test(value)) {
    throw invalid(`code de langue « ${field} » incorrect.`);
  }
  return value;
}

export function parseTranslateBody(raw: unknown): TranslateBody {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalid('corps JSON attendu.');
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    throw invalid('texte vide.');
  }
  if (body.text.length > MAX_TEXT_CHARS) {
    throw invalid(`texte trop long (${MAX_TEXT_CHARS} caractères au maximum).`, 413);
  }
  const target = langCode(body.target, 'target');
  const source = body.source == null ? null : langCode(body.source, 'source');
  if (body.formal != null && typeof body.formal !== 'boolean') {
    throw invalid('« formal » doit être un booléen.');
  }
  return { text: body.text, source, target, formal: body.formal ?? null };
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const tooLarge = () => invalid('corps trop volumineux.', 413);
  const declared = Number(req.headers.get('Content-Length'));
  if (declared > MAX_BODY_BYTES) throw tooLarge();

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw invalid('JSON invalide.');
  }
}

/** Refuses requests that do not come from the app's own origin (browser-enforced headers). */
export function checkSameOrigin(req: Request): void {
  const origin = req.headers.get('Origin');
  if (origin !== null) {
    let parsed: string | null = null;
    try {
      parsed = new URL(origin).origin;
    } catch {
      // unparsable origin (e.g. "null"): refused below
    }
    // Scheme, host and port: a lookalike host or another port is another site.
    if (parsed === new URL(req.url).origin) return;
  } else if (req.headers.get('Sec-Fetch-Site') === 'same-origin') {
    return;
  }
  throw new ApiError(403, 'Origine refusée.');
}

export function requireHeader(req: Request, name: string, missingMessage: string): string {
  const value = req.headers.get(name)?.trim();
  if (!value) throw new ApiError(401, missingMessage);
  return value;
}
