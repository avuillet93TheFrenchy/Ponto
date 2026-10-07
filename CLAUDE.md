# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Ponto is a bilingual (FR/EN) translation app built with Tauri 2 (Windows `.exe` and Android `.apk`) that calls two engines, DeepL and Lara, either alone or side by side for comparison. The frontend is vanilla JS + SCSS bundled by Vite; there is no UI framework. The repo is Apache-2.0, maintained by a single author who accepts PRs.

## Commands

Use **pnpm** (pinned in `package.json` via `packageManager`/`devEngines`; `npx`/`npm` fail with `EBADDEVENGINES`). Node >= 24.

```bash
pnpm dev                    # Vite dev server on :5173 (strict port)
pnpm tauri:dev              # desktop app
pnpm tauri:android:dev      # Android
pnpm build                  # vite build -> dist/
pnpm tauri:build            # Windows bundle
pnpm build:web              # vite build --mode web (adds the PWA manifest + service worker)
pnpm dev:web                # build:web, then `wrangler dev -c worker/wrangler.toml` (site + /api on one origin)
pnpm deploy:web             # NODE_ENV=production build:web (uploads source maps to Sentry), then `wrangler deploy`; needs `wrangler login`
pnpm tauri:android:build    # APK, aarch64 only
pnpm tauri icon public/logo.svg   # regenerate src-tauri/icons; it overwrites the Android adaptive layers (see Conventions)

pnpm lint                   # lint:js + lint:css + lint:html
pnpm lint:fix:js            # / lint:fix:css
pnpm typecheck              # tsc --noEmit (TypeScript 7)

pnpm test                   # vitest run
pnpm exec vitest run __tests__/foo.test.js -t "case name"   # single test
pnpm test:coverage          # enforces 80/75/80/80 thresholds
pnpm test:e2e               # Playwright (starts vite on 127.0.0.1:5173 and builds + previews the web bundle on :4173 itself)
pnpm exec playwright test -g "case name" --project=android-landscape

cargo test                  # Rust unit tests, run from src-tauri/
pwsh scripts/build-release.ps1 -Target windows|android|all   # checks + signed build; asks the updater key password (see script header)
pwsh dev-windows.ps1        # interactive helper: clears port/cache, then runs `tauri dev`
pwsh dev-android.ps1        # interactive helper: adb Wi-Fi pairing/device choice, then runs `tauri android dev` (needs ANDROID_HOME)
```

## Architecture

- **Entry**: `index.html` loads `src/main.js`, which imports `src/instrument.js` first (Sentry must init before anything else) and `src/style.scss` (the single stylesheet, at the root of `src/`).
- **File layout rule**: only `main.js`, `instrument.js` and `style.scss` live at the root of `src/`; all other JS goes in `src/js/` (alias `@js/*`). Existing exception not yet moved: `src/tauri/`.
- **Tauri access goes through `src/tauri/`**: one thin wrapper per `@tauri-apps/plugin-*` (store, log, process, window-state, updater, plus `core`, `path`, `event` from `@tauri-apps/api`), re-exported by `src/tauri/index.js`. Business code imports from there (`@tauri` alias), never from `@tauri-apps/*` directly, so tests can mock a single layer. Every wrapper throws its own typed error (`StoreError`, `CoreError`, ...) that keeps the original on `cause`. Add new plugin access by following an existing wrapper (e.g. `process.js`).
- **Web build** (`vite build --mode web`; `vite-plugin-pwa` only in that mode, so the Tauri `dist/` has no `sw.js`/manifest): one Cloudflare Worker serves `dist/` and `/api/*` (`worker/`, config `worker/wrangler.toml`; routes `/api/translate|languages/deepl|lara`, keys in `X-Deepl-Key` / `X-Lara-Id` / `X-Lara-Secret` headers, never logged). The browser side lives in `src/js/web/` (`vault.js`, `storage.js`, `backend.js`, `pwa.js`, `install.js`). **The Tauri/web switch lives in `src/tauri/core.js` and `store.js`** (`isTauriRuntime()`): business code is unchanged and `invoke`/Store transparently go to the Worker/vault in a plain browser. Headers and CSP are in `public-web/_headers`. `public-web/` holds every file only the web build needs (`_headers`, `.assetsignore`, PWA icons); the `ponto-web-public` plugin in `vite.config.ts` emits them into `dist/` and injects the `apple-touch-icon` link only in `--mode web`, so the Tauri build (`.exe`/`.apk`) ships none of them. Put new web-only static files there, not in `public/`. The service worker has no `skipWaiting`: `src/js/web/pwa.js` shows the `#update` banner when a new version waits, and accepting posts `SKIP_WAITING` then reloads.
- **Settings** (`src/js/settings.js`): persisted with `plugin-store` in `settings.json`. In the Tauri apps, API keys (DeepL key, Lara access key id/secret) are stored there in plain text; the README and the settings dialog say so, keep them in sync if that changes. In the web build they are encrypted instead (AES-GCM vault in IndexedDB, `src/js/web/vault.js`) and never reach `localStorage`. If IndexedDB cannot be opened the vault works in memory only (`vaultIsPersistent()` is false) and `vaultDelete`/`vaultClear` just empty it; if a delete or clear fails on an open database they fall back to memory and reject, since the value may remain on disk. `DEFAULTS` defines the schema; `loadSettings()` also migrates the legacy `direction` field to `sourceLang`/`targetLang`.
- **UI model**: `#panes` holds one row per engine, cloned from `<template id="engine-row">` in `index.html` (source textarea + translation output). Provider mode is `deepl` | `lara` | `both`. On Android, `both` only applies in landscape. Dialogs (`#settings`, `#lang-picker`) are native `<dialog>` elements.
- **Rust commands**: a command lives in `src-tauri/src/<module>.rs` and must also be declared (`mod`) and listed in `generate_handler!` in `lib.rs`; the Lara token cache is the managed `LaraState`. Backend errors are French strings: `src/js/errors.js` (`describeBackendError`) maps each family to a `t()` key and flags the ones that open the settings; add a rule there when you add an error message in Rust.
- **HTTP from Rust**: every request goes through `crate::http::client()` (`src-tauri/src/http.rs`), never `reqwest::Client::new()`. reqwest 0.13 verifies TLS with `rustls-platform-verifier`, which on Android needs a Kotlin component and a JNI init Ponto does not have: without them every HTTPS call panics (translation, and the Sentry transport, so no events or feedback). On Android `http.rs` trusts the bundled `webpki-root-certs` instead, and `lib.rs` gives Sentry a transport built on that client.
- **Formality**: `formalFor(engine)` in `main.js` sends it to DeepL only for targets that support it, and to Lara (as an instruction) for every target it translates to.
- **Error reporting**: `src/instrument.js` configures Sentry with `tauri-plugin-sentry-api` so events route through the Rust side inside Tauri and use `VITE_SENTRY_DSN` in a plain browser. Breadcrumbs go through `scrubBreadcrumb` (`src/js/web/scrub.js`, strips the key headers) in both runtimes, including the ones forwarded to Rust; events go through `scrubEvent` and streamed spans through `scrubSpan` (`beforeSendSpan`; `beforeSendTransaction` is ignored with the SDK's default `traceLifecycle: 'stream'`). On the Rust side the native crash reporter is `sentry::integrations::minidump::MinidumpIntegration`, added to the options before `sentry::init` in `lib.rs` (desktop only; `tauri-plugin-sentry` 0.7 no longer has a `minidump` module). The Vite Sentry plugin (sourcemap upload) is only enabled when `NODE_ENV=production`. The upload uses org `alexandre69coder` (region `de`), project `javascript`, and the `package.json` version as release, the same value as `release` in `instrument.js` (`VITE_APP_VERSION`). Its token is in the gitignored `.env.sentry-build-plugin`: never open it. Do not add a `url` option to the plugin (the token already carries it) and do not re-run `@sentry/wizard`: it appends a second `sentryVitePlugin` to `vite.config.ts`.
- **Signing**: `tauri build` reads `TAURI_SIGNING_PRIVATE_KEY` (path or content of the updater key), not `..._PATH`; `scripts/build-release.ps1` sets it for the build process only.
- **Vite** (`vite.config.ts`): dev server port 5173 with HMR on 1421 when `TAURI_DEV_HOST` is set; `terser` minification with `console.log` stripped unless `TAURI_ENV_DEBUG === 'true'`; targets Chromium/Firefox 100+ (matches `.browserslistrc`); aliases `@tauri`, `@js/*`, `@/*` (mirrored in `tsconfig.json` `paths`; keep both in sync).

## Conventions

- **JSDoc types are mandatory in `.js` files**: `tsconfig.json` runs `strict` + `checkJs`, so untyped parameters fail `pnpm typecheck`. Types live in JSDoc `@typedef`s, not `.ts` files.
- 2-space indent, single quotes (ESLint `quotes` rule), LF, final newline (`.editorconfig`). `src/tauri/*.js` still uses 4 spaces from before the rule; do not mix styles within a file.
- **i18n** (`src/js/settings.js`): UI strings are addressed with *vous* (never *tu*). Messages live in the single `MESSAGES` table as `key: [fr, en]` pairs (one entry per key, so a missing language fails `pnpm typecheck`; separate `fr`/`en` objects were flagged as duplicated code by Sonar). Static text uses `data-i18n="key"` / `data-i18n-attr="attr:key;…"` in `index.html` (French stays as the pre-JS default); text built in JS uses `t(key, { param })` with `{param}` placeholders. Elements cloned from a `<template>` need `applyTranslations(fragment)`. Switching goes through `setUiLanguage()`, which triggers `refreshUi()` in `main.js`; language names come from `languages.js` and follow `setLanguageNamesLocale()` (rebuild the catalog after a change).
- Switches use `role="switch"` on a native checkbox with `aria-checked` kept in sync by `bindSwitchAria` / `syncSwitchAria` in `src/js/settings.js`; call `syncSwitchAria` after setting `.checked` from code.
- Test conventions (Vitest, Worker tests, Playwright E2E) live in `__tests__/CLAUDE.md`, loaded when working under `__tests__/`.
- `security/detect-object-injection` is disabled only for `src/js/**` and `src/main.js`; elsewhere it stays on.
- HTML is checked by htmlhint with `inline-script-disabled` and `inline-style-disabled`: no inline `<script>`/`style`.
- Android adaptive icon (`src-tauri/icons/android`): `tauri icon` generates a full-logo foreground on a white background, which looks wrong once masked. Ours is a P-only foreground (`ic_launcher_foreground.png`) over a gradient background (`ic_launcher_background.png`, referenced from `mipmap-anydpi-v26/ic_launcher.xml`); re-apply that after every `tauri icon` run.
- Commit messages: short English imperative subject (see `git log`).
- README is bilingual (FR then EN in one file); update both halves together.

## State of the repo

Rust, Tauri and Android details live in `src-tauri/CLAUDE.md`, loaded when working under `src-tauri/`. Do not re-add fs/http/dialog/notification/opener/os Tauri plugins without a real need: DeepL and Lara are called from Rust commands, not from the webview.

Outside Tauri (plain `pnpm dev` in a browser) `plugin-store` and `plugin-log` are missing: `openSettings()` falls back to empty values and `report()` swallows log failures, but saving settings fails. Backend error text is hard-coded French in the Rust files (some use *tu*); it is translated in the UI by `errors.js` (see Architecture), and unknown texts are shown unchanged.

CI: `.github/workflows/build.yml` runs SonarQube on `main` and PRs and needs the `SONAR_TOKEN` repository secret.

`.env` (gitignored) holds local DeepL/Lara credentials and `PORT`; never print or commit its values.
