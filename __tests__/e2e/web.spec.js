import { expect, test as base } from '@playwright/test';
import http from 'node:http';

/**
 * Web build E2E: runs against `vite preview --mode web` (see playwright.config.ts), in plain
 * Chromium WITHOUT the fake Tauri of fixtures.js, so the app uses the encrypted vault and the
 * Worker routes. `/api/*` is mocked with `page.route`, since no Worker runs here.
 */

const DEEPL_KEY = 'e2e-deepl-secret-key-7f3a:fx';
const LARA_ID = 'e2e-lara-id-91c2';
const LARA_SECRET = 'e2e-lara-secret-d84b';
const NATIVE_URL = 'https://github.com/avuillet93TheFrenchy/Ponto/releases/latest';

const test = base.extend(
  /** @type {import('@playwright/test').Fixtures<{ blockSentry: void }, {}, import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions>} */ ({
    // The DSN in .env.local would otherwise send the test errors to the real Sentry project.
    blockSentry: [
      async ({ context }, use) => {
        await context.route(/ingest\..*sentry\.io/, (route) => route.abort());
        await use();
      },
      { auto: true },
    ],
  })
);

/**
 * @typedef {object} ApiCall
 * @property {string} path
 * @property {string} search
 * @property {string} method
 * @property {Record<string, string>} headers
 * @property {any} body
 */

/**
 * Answers `/api/*` like the Worker would and records what the app sent.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<ApiCall[]>} The (live) list of calls.
 */
async function mockApi(page) {
  /** @type {ApiCall[]} */
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ path: url.pathname, search: url.search, method: request.method(), headers: request.headers(), body });
    if (url.pathname.startsWith('/api/translate/')) {
      const engine = url.pathname.endsWith('/deepl') ? 'DeepL' : 'Lara';
      await route.fulfill({ json: { translation: `${engine} : ${body.text}` } });
      return;
    }
    // Language lists: an error keeps the built-in lists, like the fake Tauri does.
    await route.fulfill({ status: 500, json: { error: 'Liste des langues indisponible.' } });
  });
  return calls;
}

/**
 * @param {ApiCall[]} calls
 * @returns {ApiCall[]}
 */
const translations = (calls) => calls.filter((c) => c.path.startsWith('/api/translate/'));

/**
 * Opens the app in French (Chromium runs in en-US) with an optional provider.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'deepl' | 'lara' | 'both'} [provider]
 * @param {string} [origin] - Overrides the configured base URL.
 */
async function openApp(page, provider = 'deepl', origin = '') {
  await page.addInitScript((p) => {
    if (localStorage.getItem('ponto-settings') === null) {
      localStorage.setItem('ponto-settings', JSON.stringify({ uiLang: 'fr', provider: p }));
    }
  }, provider);
  await page.goto(`${origin}/`);
  await expect(page.locator('#panes .row').first()).toBeVisible();
}

/** @param {import('@playwright/test').Page} page */
async function saveKeys(page) {
  await page.locator('#open-settings').click();
  await page.locator('#deepl-key').fill(DEEPL_KEY);
  await page.locator('#lara-id').fill(LARA_ID);
  await page.locator('#lara-secret').fill(LARA_SECRET);
  await page.locator('#settings-form button[value="save"]').click();
  await expect(page.locator('#settings')).not.toBeVisible();
  // The dialog closes before the keys are written: the toast says they are stored.
  await expect(page.locator('#toast')).toHaveText('Paramètres enregistrés');
}

/**
 * Reads every record of the vault database and returns all their content as text
 * (strings, and bytes decoded both as UTF-8 and as Latin-1) plus the record count.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ count: number, texts: string[] }>}
 */
function readVault(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('ponto-vault');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const store = db.transaction('kv', 'readonly').objectStore('kv');
          const keys = store.getAllKeys();
          const values = store.getAll();
          values.onerror = () => reject(values.error);
          values.onsuccess = () => {
            /** @type {string[]} */
            const texts = [];
            /** @param {unknown} value */
            const collect = (value) => {
              if (typeof value === 'string') texts.push(value);
              else if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
                const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                texts.push(new TextDecoder().decode(bytes), new TextDecoder('latin1').decode(bytes));
              } else if (value && typeof value === 'object' && !(value instanceof CryptoKey)) {
                for (const inner of Object.values(value)) collect(inner);
              }
            };
            collect(values.result);
            for (const key of keys.result) collect(String(key));
            db.close();
            resolve({ count: values.result.length, texts });
          };
        };
      })
  );
}

test.describe('clés', () => {
  test('les clés saisies survivent au rechargement et ne sont lisibles ni dans localStorage ni dans IndexedDB', async ({ page }) => {
    await mockApi(page);
    await openApp(page);
    await saveKeys(page);

    await page.reload();
    await expect(page.locator('#panes .row').first()).toBeVisible();
    await page.locator('#open-settings').click();
    await expect(page.locator('#deepl-key')).toHaveValue(DEEPL_KEY);
    await expect(page.locator('#lara-id')).toHaveValue(LARA_ID);
    await expect(page.locator('#lara-secret')).toHaveValue(LARA_SECRET);

    const local = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    const vault = await readVault(page);
    expect(vault.count).toBeGreaterThan(0); // the check below is meaningful: the vault holds records
    for (const secret of [DEEPL_KEY, LARA_ID, LARA_SECRET]) {
      expect(local).not.toContain(secret);
      for (const text of vault.texts) expect(text).not.toContain(secret);
    }
  });

  test('« Effacer mes clés » vide les champs et le coffre', async ({ page }) => {
    await mockApi(page);
    await openApp(page);
    await saveKeys(page);
    await page.locator('#open-settings').click();
    await expect(page.locator('#deepl-key')).toHaveValue(DEEPL_KEY);
    expect((await readVault(page)).count).toBeGreaterThan(0);

    await page.locator('#clear-keys').click();

    await expect(page.locator('#deepl-key')).toHaveValue('');
    await expect(page.locator('#lara-id')).toHaveValue('');
    await expect(page.locator('#lara-secret')).toHaveValue('');
    await expect(page.locator('#toast')).toHaveText('Vos clés ont été effacées');
    expect((await readVault(page)).count).toBe(0);

    await page.reload();
    await page.locator('#open-settings').click();
    await expect(page.locator('#deepl-key')).toHaveValue('');
  });
});

test.describe('traduction', () => {
  test('traduit avec les deux moteurs : /api reçoit les bons en-têtes, jamais de clé dans l’URL', async ({ page }) => {
    const calls = await mockApi(page);
    await openApp(page, 'both');
    await saveKeys(page);
    await expect(page.locator('#panes .row')).toHaveCount(2);

    await page.locator('#source-deepl').fill('  Hello  ');
    await page.locator('#source-lara').fill('Hello');
    await page.locator('#source-deepl').press('Control+Enter');

    await expect(page.locator('#panes .row:has(.engine-tag[data-engine="deepl"]) .target')).toHaveText('DeepL : Hello');
    await expect(page.locator('#panes .row:has(.engine-tag[data-engine="lara"]) .target')).toHaveText('Lara : Hello');

    const sent = translations(calls);
    const deepl = sent.find((c) => c.path === '/api/translate/deepl');
    const lara = sent.find((c) => c.path === '/api/translate/lara');
    expect(sent).toHaveLength(2);

    expect(deepl?.method).toBe('POST');
    expect(deepl?.headers['x-deepl-key']).toBe(DEEPL_KEY);
    expect(deepl?.headers['x-lara-id']).toBeUndefined();
    expect(deepl?.body).toEqual({ text: 'Hello', source: 'EN', target: 'FR', formal: true });

    expect(lara?.method).toBe('POST');
    expect(lara?.headers['x-lara-id']).toBe(LARA_ID);
    expect(lara?.headers['x-lara-secret']).toBe(LARA_SECRET);
    expect(lara?.headers['x-deepl-key']).toBeUndefined();
    expect(lara?.body).toMatchObject({ text: 'Hello' });

    for (const call of calls) {
      expect(call.search).toBe('');
      for (const secret of [DEEPL_KEY, LARA_ID, LARA_SECRET]) {
        expect(call.path).not.toContain(secret);
        expect(JSON.stringify(call.body)).not.toContain(secret);
      }
    }
  });
});

test.describe('service worker', () => {
  /**
   * Waits until the service worker is active, then reloads so the page is under its control
   * (the worker does not claim clients).
   *
   * @param {import('@playwright/test').Page} page
   */
  async function controlledByServiceWorker(page) {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  }

  test('le manifest est servi et valide ; le service worker s’enregistre', async ({ page, request }) => {
    await mockApi(page);
    await openApp(page);

    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'Ponto',
      short_name: 'Ponto',
      display: 'standalone',
      scope: '/',
      start_url: '/',
      lang: 'fr',
    });
    expect(manifest.icons.map((/** @type {{ sizes: string, purpose: string }} */ i) => `${i.sizes}:${i.purpose}`)).toEqual([
      '192x192:any',
      '512x512:any',
      '512x512:maskable',
    ]);
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok()).toBe(true);
    }

    const scriptURL = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
    expect(scriptURL).toMatch(/\/sw\.js$/);
  });

  test('/api n’est jamais servi depuis le cache : deux traductions = deux requêtes réseau', async ({ page }) => {
    const calls = await mockApi(page);
    await openApp(page);
    await saveKeys(page);
    await controlledByServiceWorker(page);

    for (const text of ['Hello', 'Hello again']) {
      await page.locator('#source-deepl').fill(text);
      await page.locator('#source-deepl').press('Control+Enter');
      await expect(page.locator('#panes .target').first()).toHaveText(`DeepL : ${text}`);
    }
    // Same text twice would also hit a cache: the count proves each translation reached the network layer.
    await page.locator('#source-deepl').fill('Hello again');
    await page.locator('#source-deepl').press('Control+Enter');

    await expect.poll(() => translations(calls).length).toBe(3);
    expect(translations(calls).map((c) => c.body.text)).toEqual(['Hello', 'Hello again', 'Hello again']);
  });

  test('hors ligne : l’application s’ouvre et la traduction affiche une erreur réseau', async ({ page, context }) => {
    await mockApi(page);
    await openApp(page);
    await saveKeys(page);
    await controlledByServiceWorker(page);

    await page.unroute('**/api/**'); // offline, a mocked answer would hide the network error
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#panes .row').first()).toBeVisible();

    await page.locator('#source-deepl').fill('Hello');
    await page.locator('#source-deepl').press('Control+Enter');
    await expect(page.locator('#panes .target').first()).toContainText('Erreur réseau avec DeepL');

    await context.setOffline(false);
  });

  test('après un déploiement simulé, la nouvelle version attend, puis s’active à la demande de l’utilisateur', async ({ page, baseURL }) => {
    // Playwright cannot rewrite the service worker script request (page.route / context.route do not see it),
    // so the app is served through a small proxy whose /sw.js changes by one comment once "deployed".
    let deployed = false;
    const proxy = http.createServer(async (req, res) => {
      try {
        const upstream = await fetch(`${baseURL}${req.url}`);
        let body = Buffer.from(await upstream.arrayBuffer());
        if (deployed && req.url === '/sw.js') body = Buffer.concat([body, Buffer.from('\n// simulated deployment\n')]);
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain', 'cache-control': 'no-cache' });
        res.end(body);
      } catch {
        res.writeHead(502).end();
      }
    });
    await new Promise((resolve) => proxy.listen(0, '127.0.0.1', () => resolve(undefined)));
    try {
      const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (proxy.address()).port}`;
      await mockApi(page);
      await openApp(page, 'deepl', origin);
      await controlledByServiceWorker(page);

      await page.evaluate(() => {
        const win = /** @type {any} */ (window);
        win.__controller = navigator.serviceWorker.controller;
        win.__activeURL = navigator.serviceWorker.controller?.scriptURL;
      });
      deployed = true;
      await page.evaluate(async () => (await navigator.serviceWorker.ready).update());

      const state = () =>
        page.evaluate(async () => {
          const win = /** @type {any} */ (window);
          const registration = await navigator.serviceWorker.ready;
          return {
            waiting: registration.waiting?.state ?? null,
            installing: registration.installing?.state ?? null,
            active: registration.active?.state ?? null,
            sameActive: registration.active?.scriptURL === win.__activeURL,
            sameController: navigator.serviceWorker.controller === win.__controller,
          };
        });
      // The new version installs and waits: it must not activate, nor take the page over.
      await expect.poll(async () => (await state()).waiting).toBe('installed');
      expect(await state()).toEqual({ waiting: 'installed', installing: null, active: 'activated', sameActive: true, sameController: true });

      // The user is told and decides: accepting activates the new version and reloads the page.
      await expect(page.locator('#update')).toBeVisible();
      await page.evaluate(() => {
        /** @type {any} */ (window).__beforeUpdate = true;
      });
      await page.locator('#update-accept').click();
      await page.waitForFunction(() => !(/** @type {any} */ (window).__beforeUpdate));
      await expect.poll(async () => (await state()).waiting).toBeNull();
      expect((await state()).active).toBe('activated');
      await expect(page.locator('#update')).toBeHidden();
    } finally {
      await new Promise((resolve) => proxy.close(resolve));
    }
  });
});

test.describe('invitation à installer', () => {
  test.describe('Android, 960x432', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (Linux; Android 15; moto g15 power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Mobile Safari/537.36',
      viewport: { width: 960, height: 432 },
      isMobile: true,
      hasTouch: true,
    });

    test('UA Android à 960x432 : la bannière native s’affiche et le bouton Traduire reste cliquable', async ({ page }) => {
      const calls = await mockApi(page);
      await openApp(page);
      await saveKeys(page);

      await expect(page.locator('#install')).toBeVisible();
      await expect(page.locator('#install-native')).toBeVisible();
      await expect(page.locator('#install-native')).toHaveAttribute('href', NATIVE_URL);
      await expect(page.locator('#install-accept')).toBeHidden();

      // The global button is hidden in this layout: the real control is the row's own button.
      const control = page.locator('#translate-all, #panes .translate-one').locator('visible=true').first();
      await expect(control).toBeVisible();
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(viewport).not.toBeNull();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect(box?.y).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);

      const topmost = await control.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return hit === el || el.contains(hit);
      });
      expect(topmost).toBe(true);

      await page.locator('#source-deepl').fill('Hello');
      await control.click(); // no `force`: Playwright fails if something covers the button
      await expect(page.locator('#panes .target').first()).toHaveText('DeepL : Hello');
      expect(translations(calls)).toHaveLength(1);
    });
  });

  test.describe('Windows, 1280x720', () => {
    test.use({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    test('UA Windows à 1280x720 : bannière native, aucun bouton Installer', async ({ page }) => {
      await mockApi(page);
      await openApp(page);

      await expect(page.locator('#install')).toBeVisible();
      await expect(page.locator('#install-native')).toHaveAttribute('href', NATIVE_URL);
      await expect(page.locator('#install-accept')).toBeHidden();
      await expect(page.locator('#translate-all')).toBeVisible();
    });
  });

  test.describe('iPhone', () => {
    test.use({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
    });

    test('UA iPhone : instructions iOS', async ({ page }) => {
      // Safari has no userAgentData; Chromium would report the platform « iOS », which no real iPhone browser does.
      await page.addInitScript(() => Object.defineProperty(navigator, 'userAgentData', { value: undefined }));
      await mockApi(page);
      await openApp(page);

      await expect(page.locator('#install')).toBeVisible();
      await expect(page.locator('#install-text')).toHaveText('Pour installer Ponto : Partager › Sur l\'écran d\'accueil.');
      await expect(page.locator('#install-keys')).toBeVisible();
      await expect(page.locator('#install-native')).toBeHidden();
      await expect(page.locator('#install-accept')).toBeHidden();
    });
  });
});
