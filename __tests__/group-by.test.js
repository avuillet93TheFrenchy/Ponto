import { afterEach, describe, expect, it } from 'vitest';
import { groupBy } from '@js/group-by.js';
import { buildCatalog } from '@js/languages.js';
import { LISTS } from './fixtures/languages.js';

describe('groupBy', () => {
  it('groups items by key, keeping first-seen key order and item order', () => {
    const groups = groupBy(['b1', 'a1', 'b2', 'a2', 'c1'], (s) => s[0]);
    expect([...groups.keys()]).toEqual(['b', 'a', 'c']);
    expect(groups.get('b')).toEqual(['b1', 'b2']);
    expect(groups.get('a')).toEqual(['a1', 'a2']);
  });

  it('accepts any iterable and returns an empty map for no items', () => {
    expect(groupBy(new Set([1, 2, 3, 4]), (n) => n % 2).get(0)).toEqual([2, 4]);
    expect(groupBy([], () => 'x').size).toBe(0);
  });
});

describe('older WebView without Map.groupBy', () => {
  const original = Map.groupBy;
  afterEach(() => {
    Map.groupBy = original;
  });

  it('still builds the language catalog', () => {
    // @ts-expect-error simulate Chrome < 117
    delete Map.groupBy;
    expect(typeof Map.groupBy).toBe('undefined');
    expect(() => buildCatalog(LISTS)).not.toThrow();
  });
});
