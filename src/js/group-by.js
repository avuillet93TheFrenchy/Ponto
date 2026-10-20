/**
 * Replacement for `Map.groupBy` (Chrome 117+): the Android WebView can be older than the
 * Chromium 100 baseline's newest APIs, and Vite does not polyfill runtime built-ins.
 * @template T, K
 * @param {Iterable<T>} items
 * @param {(item: T) => K} keyOf
 * @returns {Map<K, T[]>}
 */
export function groupBy(items, keyOf) {
  /** @type {Map<K, T[]>} */
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
