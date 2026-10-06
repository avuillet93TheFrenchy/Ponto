import { defineConfig } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import pluginSecurity from 'eslint-plugin-security';

const NODE_TOOLING_SCRIPTS = ['.claude/**/*.js', 'scripts/**/*.js'];

export default defineConfig([
  {
    ignores: [
      'src-tauri/target/**',
      'src-tauri/gen/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  { files: ['**/*.js'], languageOptions: { globals: globals.browser } },
  { files: NODE_TOOLING_SCRIPTS, languageOptions: { globals: globals.node } },
  {
    files: ['__tests__/**/*.js'],
    languageOptions: { globals: globals.vitest },
  },
  {
    files: ['**/*.js'],
    plugins: { js },
    extends: ['js/recommended'],
    rules: {
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-var': 'error',
    },
  },
  pluginSecurity.configs.recommended,
  {
    files: NODE_TOOLING_SCRIPTS,
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['src/js/**/*.js', 'src/main.js'],
    rules: {
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['__tests__/**/*.js'],
    rules: {
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
]);
