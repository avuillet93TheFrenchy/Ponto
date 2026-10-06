import { describe, it, expect } from 'vitest';
import { scrubEvent, scrubBreadcrumb } from '../src/js/web/scrub.js';

/** @typedef {import('@sentry/browser').ErrorEvent} ErrorEvent */
/** @typedef {import('@sentry/browser').Breadcrumb} Breadcrumb */

describe('scrubEvent', () => {
  it('retire les trois en-têtes de event.request.headers, casse mélangée', () => {
    /** @type {ErrorEvent} */
    const event = {
      type: undefined,
      request: {
        headers: {
          'X-Deepl-Key': 'secret1',
          'x-LARA-id': 'secret2',
          'X-LARA-SECRET': 'secret3',
        },
      },
    };
    const out = scrubEvent(event);
    expect(out.request?.headers).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(/secret/);
  });

  it('laisse les autres en-têtes intacts', () => {
    /** @type {ErrorEvent} */
    const event = {
      type: undefined,
      request: {
        headers: { 'Content-Type': 'application/json', 'X-Deepl-Key': 'k' },
      },
    };
    const out = scrubEvent(event);
    expect(out.request?.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('retire les en-têtes des breadcrumbs', () => {
    /** @type {ErrorEvent} */
    const event = {
      type: undefined,
      breadcrumbs: [
        { category: 'fetch', data: { headers: { 'x-lara-id': 'a', Accept: '*/*' } } },
        { category: 'xhr', data: { request_headers: { 'X-Lara-Secret': 'b', Accept: '*/*' } } },
        { category: 'console' },
      ],
    };
    const out = scrubEvent(event);
    expect(out.breadcrumbs?.[0].data?.headers).toEqual({ Accept: '*/*' });
    expect(out.breadcrumbs?.[1].data?.request_headers).toEqual({ Accept: '*/*' });
    expect(out.breadcrumbs?.[2]).toEqual({ category: 'console' });
  });

  it('événement sans request ni breadcrumbs → inchangé', () => {
    /** @type {ErrorEvent} */
    const event = { type: undefined, message: 'boom' };
    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'boom' });
  });
});

describe('scrubBreadcrumb', () => {
  it('retire les en-têtes de clé et garde les autres', () => {
    /** @type {Breadcrumb} */
    const crumb = { data: { headers: { 'X-Deepl-Key': 'k', Accept: 'a' }, url: '/x' } };
    expect(scrubBreadcrumb(crumb)).toEqual({ data: { headers: { Accept: 'a' }, url: '/x' } });
  });

  it('breadcrumb sans data → inchangé', () => {
    expect(scrubBreadcrumb({ message: 'm' })).toEqual({ message: 'm' });
  });

  it("retire les en-têtes de clé d'une instance Headers sans toucher à l'original", () => {
    const headers = new Headers({ 'X-Deepl-Key': 'secret1', Accept: '*/*' });
    const out = scrubEvent(/** @type {any} */ ({ type: undefined, request: { headers } }));

    const scrubbed = /** @type {Headers} */ (/** @type {unknown} */ (out.request?.headers));
    expect(scrubbed).toBeInstanceOf(Headers);
    expect(scrubbed.get('x-deepl-key')).toBeNull();
    expect(scrubbed.get('accept')).toBe('*/*');
    expect(headers.get('x-deepl-key')).toBe('secret1');
  });

  it("retire les en-têtes de clé d'un tableau de paires", () => {
    const out = scrubBreadcrumb(
      /** @type {any} */ ({
        category: 'fetch',
        data: { headers: [['X-Lara-Id', 'secret1'], ['Accept', '*/*'], ['x-lara-secret', 'secret2']] },
      }),
    );
    expect(out.data?.headers).toEqual([['Accept', '*/*']]);
  });

  it('nettoie aussi un événement de transaction', () => {
    const out = scrubEvent(
      /** @type {any} */ ({
        type: 'transaction',
        request: { headers: { 'X-Deepl-Key': 'secret1', Accept: '*/*' } },
        breadcrumbs: [{ category: 'fetch', data: { headers: { 'X-Lara-Id': 'secret2' } } }],
      }),
    );
    expect(JSON.stringify(out)).not.toMatch(/secret/);
    expect(out.request?.headers).toEqual({ Accept: '*/*' });
  });
});
