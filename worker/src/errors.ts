const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Any status outside 400-599 (e.g. taken from upstream data) falls back to 502 instead of throwing. */
export function errorResponse(status: number, message: string): Response {
  const safe = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
  return new Response(JSON.stringify({ error: message }), { status: safe, headers: JSON_HEADERS });
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: JSON_HEADERS });
}

/** Replaces every occurrence of a secret in a message, so it never reaches the client. */
export function redact(message: string, secret: string): string {
  return secret ? message.split(secret).join('***') : message;
}

/**
 * Builds ApiErrors whose message never carries the given secrets. Longest first: a secret that
 * contains another one (an id inside a secret) must be removed whole, not left half-redacted.
 */
export function redactor(...secrets: string[]): (status: number, message: string) => ApiError {
  const ordered = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  return (status, message) => new ApiError(status, ordered.reduce((m, secret) => redact(m, secret), message));
}

/** Message of anything that was thrown. */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Parsed JSON body of an upstream answer. */
export type Json = Record<string, unknown> | unknown[] | null;
