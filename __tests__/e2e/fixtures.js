import { expect, test as base } from '@playwright/test';

/**
 * @typedef {object} AppOptions
 * @property {Record<string, unknown>} [settings] - Values already present in `settings.json`.
 * @property {Partial<Record<'translate_deepl' | 'translate_lara', string>>} [errors] - Text a command rejects with.
 */

/**
 * @typedef {object} BackendCall
 * @property {string} command
 * @property {Record<string, unknown>} args
 */

/**
 * Runs in the page before the app loads. The app talks to Rust through `window.__TAURI_INTERNALS__`,
 * which does not exist in a plain browser: this stand-in answers the Store plugin from `localStorage`
 * (so a reload keeps the settings), and the translation commands with `Engine: <text>`.
 *
 * @param {AppOptions} options
 */
function installFakeTauri({ settings = {}, errors = {} }) {
  const page = /** @type {any} */ (window);
  const STORE_KEY = 'e2e-settings-store';
  if (localStorage.getItem(STORE_KEY) === null) localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  const readStore = () => JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');

  page.isTauri = true; // what `isTauri()` checks; without it the app would use the web storage
  page.__tauriCalls = [];
  page.__TAURI_INTERNALS__ = {
    transformCallback: () => 0,
    unregisterCallback: () => {},
    convertFileSrc: (/** @type {string} */ path) => path,
    async invoke(/** @type {string} */ command, /** @type {Record<string, any>} */ args = {}) {
      switch (command) {
        case 'plugin:store|load':
          return 1;
        case 'plugin:store|get': {
          const store = readStore();
          return [store[args.key] ?? null, args.key in store];
        }
        case 'plugin:store|set': {
          localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [args.key]: args.value }));
          return null;
        }
        case 'plugin:store|save':
        case 'plugin:log|log':
          return null;
        case 'translate_deepl':
        case 'translate_lara': {
          page.__tauriCalls.push({ command, args });
          if (errors[command]) throw errors[command];
          return `${command === 'translate_deepl' ? 'DeepL' : 'Lara'} : ${args.text}`;
        }
        default:
          // Language lists included: the app then keeps its built-in lists.
          throw new Error(`commande ${command} non simulée`);
      }
    },
  };
}

/** @param {import('@playwright/test').Page} page */
function createApp(page) {
  return {
    page,

    /** @param {AppOptions} [options] */
    async open(options = {}) {
      // Chromium runs in en-US: without a stored language the UI would be English, so French is the default here.
      await page.addInitScript(installFakeTauri, { ...options, settings: { uiLang: 'fr', ...options.settings } });
      await page.goto('/');
      await expect(page.locator('#panes .row').first()).toBeVisible();
    },

    /**
     * Translates every displayed row, like Ctrl + Enter does. The global « Traduire » button is
     * hidden in the phone layout, where each row has its own button.
     */
    async translateAll() {
      await page.locator('#panes .source').first().press('Control+Enter');
    },

    /** @param {string} engine */
    row: (engine) => page.locator(`#panes .row:has(.engine-tag[data-engine="${engine}"])`),

    /**
     * @param {string} command
     * @returns {Promise<BackendCall[]>}
     */
    calls: (command) =>
      page.evaluate(
        (name) => /** @type {any} */ (window).__tauriCalls.filter((/** @type {BackendCall} */ c) => c.command === name),
        command
      ),

    /**
     * @param {string} key
     * @returns {Promise<unknown>}
     */
    stored: (key) => page.evaluate((k) => JSON.parse(localStorage.getItem('e2e-settings-store') ?? '{}')[k], key),
  };
}

/** @typedef {ReturnType<typeof createApp>} App */

export const test = base.extend(
  /** @type {import('@playwright/test').Fixtures<{ app: App }, {}, import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions>} */ ({
    app: async ({ page }, use) => {
      // The DSN in .env.local would otherwise send the test errors to the real Sentry project.
      await page.route(/ingest\..*sentry\.io/, (route) => route.abort());
      await use(createApp(page));
    },
  })
);

export { expect };
