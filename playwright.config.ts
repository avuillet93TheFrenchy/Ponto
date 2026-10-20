import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));
const isCI = Boolean(process.env.CI);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';

const webBaseURL = 'http://127.0.0.1:4173';
// A project-level `testIgnore` replaces the top-level one, so the example is listed again.
const ignoredByAppProjects = ['**/example.spec.js', '**/web.spec.js'];

const motorolaG15PowerLandscape = {
  viewport: { width: 960, height: 432 },
  screen: { width: 960, height: 432 },
  userAgent:
    'Mozilla/5.0 (Linux; Android 15; moto g15 power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.34 Mobile Safari/537.36',
  deviceScaleFactor: 2.5,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: 'chromium' as const,
};

dotenv.config({ path: resolve(rootDir, '.env'), quiet: true });
dotenv.config({ path: resolve(rootDir, '.env.local'), quiet: true });

export default defineConfig({
  testDir: './__tests__/e2e',
  testIgnore: ['**/example.spec.js'],

  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  timeout: 60_000,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  expect: {
    timeout: 5_000,
  },

  use: {
    baseURL,
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'windows-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
      testIgnore: ignoredByAppProjects,
    },
    {
      name: 'android-landscape',
      use: {
        ...motorolaG15PowerLandscape,
      },
      testIgnore: ignoredByAppProjects,
    },
    {
      // Web build (PWA) served by `vite preview --mode web`; no fake Tauri, `/api/*` is mocked per test.
      name: 'web',
      testMatch: 'web.spec.js',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        baseURL: webBaseURL,
      },
    },
  ],

  webServer: [
    {
      command: 'pnpm exec vite --host 127.0.0.1',
      url: baseURL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // Not NODE_ENV=production: that would upload source maps to Sentry.
      command: 'pnpm build:web && pnpm exec vite preview --mode web --host 127.0.0.1',
      url: webBaseURL,
      reuseExistingServer: !isCI,
      timeout: 300_000,
    },
  ],
});
