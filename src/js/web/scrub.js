/** @typedef {import('@sentry/browser').ErrorEvent} ErrorEvent */
/** @typedef {import('@sentry/browser').Breadcrumb} Breadcrumb */

/** Request headers that carry the user's API keys on the web build. */
const KEY_HEADERS = new Set(['x-deepl-key', 'x-lara-id', 'x-lara-secret']);

/**
 * @param {unknown} name
 * @returns {boolean}
 */
const isKeyHeader = (name) => typeof name === 'string' && KEY_HEADERS.has(name.toLowerCase());

/**
 * Returns a copy of a headers value without the key headers. Handles the three shapes a
 * request can carry: a plain object, a `Headers` instance and an array of [name, value] pairs.
 * Anything else is returned unchanged.
 * @param {unknown} headers
 * @returns {unknown}
 */
function scrubHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return headers;
  }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const copy = new Headers(headers);
    for (const name of KEY_HEADERS) copy.delete(name);
    return copy;
  }
  if (Array.isArray(headers)) {
    return headers.filter((pair) => !(Array.isArray(pair) && isKeyHeader(pair[0])));
  }
  if (Object.getPrototypeOf(headers) !== Object.prototype) {
    return headers;
  }
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !isKeyHeader(name)));
}

/**
 * @param {Breadcrumb} breadcrumb
 * @returns {Breadcrumb}
 */
export function scrubBreadcrumb(breadcrumb) {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  /** @type {Record<string, unknown>} */
  const copy = { ...data };
  if ('headers' in copy) copy.headers = scrubHeaders(copy.headers);
  if ('request_headers' in copy) copy.request_headers = scrubHeaders(copy.request_headers);
  return { ...breadcrumb, data: copy };
}

/**
 * Works for error events and transaction events alike.
 * @template {{ request?: { headers?: any }, breadcrumbs?: Breadcrumb[] }} T
 * @param {T} event
 * @returns {T}
 */
export function scrubEvent(event) {
  const out = { ...event };
  if (event.request?.headers) {
    out.request = {
      ...event.request,
      headers: scrubHeaders(event.request.headers),
    };
  }
  if (event.breadcrumbs) {
    out.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }
  return out;
}
