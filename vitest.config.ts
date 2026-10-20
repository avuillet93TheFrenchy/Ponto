import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig({ mode: 'test', command: 'serve', isSsrBuild: false, isPreview: false }),
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',

      environmentOptions: {
        jsdom: {
          url: 'http://localhost:5173',
        },
      },

      pool: 'forks',

      isolate: true,

      css: false,
      setupFiles: './__tests__/setup.js',

      clearMocks: true,
      mockReset: true,

      testTimeout: 10000,

      include: [
        '__tests__/**/*.{test,spec}.{js,mjs,cjs}',
      ],

      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '__tests__/e2e/**',
        '**/playwright-report/**',
        '**/test-results/**',
      ],

      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'json', 'lcov'],
        reportsDirectory: './coverage',

        include: [
          'src/**/*.js',
          'worker/src/**/*.ts',
        ],

        exclude: [
          'src/main.js',
          'src/instrument.js',
        ],

        thresholds: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },
  })
);
