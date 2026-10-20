// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import viteConfig from '../vite.config.ts';

/**
 * @param {string} file Path relative to the repository root.
 * @returns {string}
 */
const read = (file) => readFileSync(join(process.cwd(), file), 'utf8');

/**
 * @param {string} headers Content of a Cloudflare `_headers` file.
 * @param {string} path Route (`/*`, `/sw.js`, ...).
 * @returns {Map<string, string>} Header values of that route, by lowercase name.
 */
const headersFor = (headers, path) => {
  /** @type {Map<string, string>} */
  const found = new Map();
  let inRoute = false;
  for (const line of headers.split('\n')) {
    if (/^\S/.test(line)) {
      inRoute = line.trim() === path;
    } else if (inRoute && line.trim()) {
      const index = line.indexOf(':');
      found.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim());
    }
  }
  return found;
};

/**
 * @param {string} csp Content-Security-Policy value.
 * @param {string} name Directive name.
 * @returns {string[]} Sources of the directive.
 */
const directive = (csp, name) => {
  const part = csp.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name} `));
  return part ? part.split(/\s+/).slice(1) : [];
};

const headers = read('public-web/_headers');
const csp = headersFor(headers, '/*').get('content-security-policy') ?? '';

describe('public-web/_headers', () => {
  it('la CSP interdit unsafe-inline dans script-src', () => {
    expect(directive(csp, 'script-src')).toEqual(['\'self\'']);
  });

  it('la CSP autorise manifest-src et worker-src sur self', () => {
    expect(directive(csp, 'manifest-src')).toEqual(['\'self\'']);
    expect(directive(csp, 'worker-src')).toEqual(['\'self\'']);
  });

  it('connect-src liste Sentry et self seulement', () => {
    expect(directive(csp, 'connect-src')).toEqual(['\'self\'', 'https://*.ingest.de.sentry.io']);
  });

  it('frame-ancestors none', () => {
    expect(directive(csp, 'frame-ancestors')).toEqual(['\'none\'']);
  });

  it('les autres en-têtes de sécurité sont posés sur toutes les routes', () => {
    const all = headersFor(headers, '/*');
    expect(all.get('x-content-type-options')).toBe('nosniff');
    expect(all.get('referrer-policy')).toBe('no-referrer');
  });

  it('seule la règle /* pose la CSP, et elle ne fixe pas Cache-Control', () => {
    // Cloudflare joins the values of every rule matching a URL: a second CSP or a Cache-Control on
    // /* would be merged with the ones of /sw.js and the manifest.
    const routes = headers.split('\n').filter((line) => /^\S/.test(line)).map((line) => line.trim());
    expect(routes).toContain('/*');
    for (const route of routes.filter((r) => r !== '/*')) {
      expect(headersFor(headers, route).has('content-security-policy'), route).toBe(false);
    }
    expect(headersFor(headers, '/*').has('cache-control')).toBe(false);
  });

  it('sw.js et le manifest ne sont pas mis en cache longtemps', () => {
    expect(headersFor(headers, '/sw.js').get('cache-control')).toBe('no-cache');
    expect(headersFor(headers, '/manifest.webmanifest').get('cache-control')).toBe('no-cache');
  });
});

describe('déploiement', () => {
  it('.assetsignore exclut les .map', () => {
    expect(read('public-web/.assetsignore').split('\n').map((l) => l.trim())).toContain('*.map');
  });

  it('package.json expose build:web, dev:web, deploy:web', () => {
    const { scripts } = JSON.parse(read('package.json'));
    expect(scripts['build:web']).toBe('vite build --mode web');
    expect(scripts['dev:web']).toBe('pnpm build:web && wrangler dev -c worker/wrangler.toml');
    expect(scripts['deploy:web']).toBe(
      'cross-env NODE_ENV=production pnpm build:web && wrangler deploy -c worker/wrangler.toml',
    );
  });

  it('le manifest PWA est décrit en français', () => {
    expect(read('vite.config.ts')).toContain('description: \'Traduction FR/EN avec DeepL et Lara\'');
  });
});

describe('fichiers propres au web (public-web/)', () => {
  /**
   * @param {string} mode Vite mode.
   * @returns {any[]} Flat list of the plugins of the config for that mode.
   */
  const pluginsFor = (mode) =>
    [(/** @type {any} */ (viteConfig))({ mode, command: 'build', isSsrBuild: false, isPreview: false }).plugins]
      .flat(Infinity)
      .filter(Boolean);
  const webPublic = (/** @type {string} */ mode) => pluginsFor(mode).find((p) => p.name === 'ponto-web-public');

  it("le build Tauri (mode production) n'embarque rien de public-web/", () => {
    expect(webPublic('production')).toBeUndefined();
    for (const file of ['_headers', '.assetsignore', 'apple-touch-icon.png', 'pwa-192.png']) {
      expect(existsSync(join(process.cwd(), 'public', file))).toBe(false);
    }
  });

  it('le build web émet tous les fichiers de public-web/ à la racine de dist/', () => {
    /** @type {string[]} */
    const emitted = [];
    webPublic('web').generateBundle.call({
      emitFile: (/** @type {{ fileName: string }} */ file) => emitted.push(file.fileName),
    });
    expect(emitted.sort()).toEqual(
      ['.assetsignore', '_headers', 'apple-touch-icon.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
    );
  });

  it("le lien apple-touch-icon n'est injecté que dans le build web", () => {
    expect(read('index.html')).not.toContain('apple-touch-icon');
    expect(webPublic('web').transformIndexHtml()).toEqual([
      expect.objectContaining({ tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } }),
    ]);
  });
});
