# HatMP — project conventions

Project-specific rules that used to be hard-coded in the agents and skills of this toolkit. To apply them
to HatMP, copy `examples/hatmp/project.json` to `.claude/project.json` (it lists this file in
`conventions`, so every reviewer and generator reads it).

Stack: Tauri v2 + Vite + vanilla JS type-checked with JSDoc (no `.ts` sources), SCSS, bun. Targets:
Windows (NSIS .exe), Linux (.deb, .rpm, .AppImage), Android (.apk, aarch64 only) and the plain web build
(`dist/`). "JavaScript first, then migrated to JavaScript frameworks in a second phase."

## Layout

| Path | Content |
| --- | --- |
| `src/js/` | Modern ES modules (i18n, age gate, asset sync...) |
| `src/js/migrator/` | The original engine: excluded from `lint:js` (see `lint:legacy`) and from unit coverage; covered end to end by `__tests__/e2e/legacy-engine.spec.js` until migrated out |
| `src/tauri/` | Thin wrappers around `@tauri-apps/plugin-*` (catch-and-rethrow error convention) |
| `src/scss/` | SCSS sources |
| `src/local/*.json` | Locale files (English is the reference) |
| `src/libs/` | Vendored libraries — protected, never edited |
| `src-tauri/` | Rust backend; `src-tauri/icons/` and `src-tauri/keystore*` protected |
| `scripts/` | Node tooling, tested in `__tests__/vitest/` |
| `website/` | Project site (`site.js`, `translations.js`, `index.html`) |

Path aliases: `@tauri` / `@tauri/*` (→ `src/tauri/`), `@js/*` (→ `src/js/`), `@scss/*` (→ `src/scss/`),
`@locales/*` (→ `src/local/`), `@/*` (→ `src/`). `@tauri`, `@js/*` and `@scss/*` are the ones used in the
codebase. There is no `@utils`/`@components` alias and no `src/utils`/`src/components` folder.

## Styles

Styles are already 100% SCSS (`src/scss/*.scss`, `sass-embedded`, `stylelint.config.mjs` for SCSS): no plain
CSS left to migrate. Compiled SCSS goes through `postcss.config.cjs` (`postcss-rem-to-px` →
`postcss-px-to-viewport-8-plugin`, `border*`/`box-shadow`/`text-shadow`/`outline*` excluded). A new partial
goes under `src/scss/` and is imported like the existing ones (`@scss/*` alias).

## Code review

### HTML

- No inline scripts (forbidden by CSP and HTMLHint), no inline styles
- IDs and classes in dash-case; labels associated with inputs; links with a `rel` attribute

### CSS / SCSS

- `stylelint-config-standard-scss` (see `stylelint.config.mjs`); property order follows `concentric-css`
  (`order/properties-order`)
- Units are intentionally mixed per context (px/rem/em/vw/svh/dvh/%) — don't flag a unit just because it is not px
- `border*`/`box-shadow`/`text-shadow`/`outline*` are excluded from the PostCSS rem→px→vw pipeline and stay
  fixed-pixel; other values go through `postcss-rem-to-px` then `postcss-px-to-viewport-8-plugin`
  (1920px reference viewport)
- Values kept fixed-pixel via `body.device-*` classes (`deviceOverrides.scss`, `gameImage.scss`) rather
  than `@media` are deliberate
- Colours of the screens outside the game scene go through the theme variables of `a11y.scss`
  (`var(--bg-color, <dark fallback>)`, light/dark via `prefers-color-scheme`); the fallback is required by
  `no-unknown-custom-properties`. The game scene itself stays dark on purpose
- No `!important` (SonarQube `css:S9423`)
- The order of the `@scss/*` imports in `src/main.js` is the cascade order: a new file goes where its rules must win

### JavaScript

- JSDoc types (`@param`/`@returns`/`@typedef`) checked by `bun run typecheck` (`tsc --noEmit`)
- ESLint: single quotes, no `var`, `eslint-plugin-security` and `eslint-plugin-no-unsanitized` (no
  `innerHTML` with untrusted text: build nodes with `textContent`)
- User-facing text goes through `t()` / `data-i18n*` attributes, with the key in every `src/local/*.json`

### Licensing

- Every new file has an SPDX header (`SPDX-License-Identifier` + `Copyright` lines) or, if it cannot carry
  a comment (JSON, images, a `SKILL.md`), an entry in `REUSE.toml` — see "Licensing" in `CLAUDE.md`. Code
  taken from the original game keeps FF5's copyright (mixed header)
- Check: `uvx --from "reuse[charset-normalizer]" reuse lint`

### Tauri

- fs permissions scoped to `$APPLOCALDATA` (the downloaded game assets) — anything wider needs a reason

## Scripts

| Script | What it does |
| --- | --- |
| `bun run lint` | `lint:js` (eslint src __tests__ scripts website, migrator excluded) + `lint:css` (stylelint src/**/*.{css,scss}, website/**/*.css) + `lint:html` (htmlhint index.html website/index.html) |
| `bun run lint:legacy` | The original engine — expected to report errors until migrated: report the count, don't block |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test:coverage` | Vitest with thresholds 95 % statements/functions/lines, 90 % branches (`vitest.config.ts`); `src/js/migrator/` and `scripts/sync-agents.js` excluded |
| `bun run test:e2e` | Playwright — projects `windows-desktop` (Chromium), `linux-webkit` (WebKit), `android-landscape`; install browsers with `bun run playwright:install:chromium` / `:webkit` |
| `bun run tauri:build:linux` | .deb, .rpm, .AppImage |
| `bun run tauri:android:build` | aarch64 only (no emulators); `targetSdk = 35`, `minSdkVersion` 24 in `src-tauri/gen/android/app/build.gradle.kts`; `JAVA_HOME` must point to JDK 25 |

There is no pre-commit hook: a lint/type/licensing failure is a release blocker.

## Release

- Versions kept in sync: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
- Web build: `VITE_ASSETS_BASE_URL` must be set — `resourceUrl()` in `src/js/resourceLoader.js` loads every
  game asset from it; a missing value is a blocker
- With `SENTRY_AUTH_TOKEN` set (or `.env.sentry-build-plugin`), a production build uploads source maps to Sentry

## Tests

- Unit tests mirror `src/` under `__tests__/`: `src/js/<name>.js` → `__tests__/js/<name>.test.js`,
  `src/tauri/<name>.js` → `__tests__/tauri/<name>.test.js`; `src/main.js` and `src/instrument.js` have
  theirs at the root (`__tests__/main.test.js`, `__tests__/instrument.test.js`); `scripts/<name>.js` →
  `__tests__/vitest/<name>.test.js` (`// @vitest-environment node` on the first lines, `describe`/`it`/...
  imported from `'vitest'`); `website/site.js` and `website/translations.js` → `__tests__/website.test.js`
- `describe`/`it`/`expect`/`vi` are globals (`test.globals: true`) — don't import them (except in `__tests__/vitest/`)
- jsdom environment; import the module under test with a relative path, not an alias
- `__tests__/setup.js` already mocks every `@tauri-apps/*` package, `jquery` and `tauri-plugin-sentry-api`,
  and mocks are reset after each test (`mockReset: true`): set return values in `beforeEach` or in the test
- A module that does its work when imported (like `src/instrument.js`) runs once per registry: re-import it
  after `vi.resetModules()`, and change `import.meta.env` with `vi.stubEnv()`
- Test files start with the SPDX header; test names in English
- E2E already covers the age gate (`age-gate.spec.js`), the language selector (`language.spec.js`), the
  landscape guard on phones (`landscape.spec.js`) and the start of the legacy engine
  (`legacy-engine.spec.js`). Missing: save/export, game menu, in-game navigation. E2E runs on the Vite dev
  server, outside Tauri: native-only flows (asset sync, updates, `invoke()`) need unit tests

### E2E specifics

- Import `{ test, expect }` from `./fixtures.js`, **not** `@playwright/test`: it aborts every request to
  another host than the dev server (no data to Sentry — `VITE_SENTRY_DSN` is set in `.env.local` — and no
  dependency on the assets CDN), and provides `pageErrors`, `consoleMessages` and `locale('<lang>')` (reads
  `src/local/<lang>.json`); compare texts with `locale('en-US')` / `locale('fr')` values
- `pages/HatmpPage.js` covers the start screen (age gate, language selector, start of the legacy engine):
  extend it; wait for the engine with `HatmpPage.waitForEngine()` (~10 s) rather than fixed timeouts
- `playwright.config.ts`: `testDir: './__tests__/e2e'`, base URL `http://127.0.0.1:5173`, started by
  `bun run dev --host 127.0.0.1` (reused outside CI); projects `windows-desktop` (Desktop Chrome 1280x720),
  `linux-webkit` (Desktop Safari 1280x720), `android-landscape` (Motorola G15 Power landscape, 960x432,
  touch) — no `chromium`/`firefox`/`webkit` project names; `landscape.spec.js` runs on `android-landscape`
  only; `fullyParallel: false`, `workers: 1`, `timeout: 60_000`; `testIgnore: ['**/example.spec.js']`
- E2E files are type-checked (`bun run typecheck` covers `__tests__/`)

## UI modules

Single-entry-point vanilla JS app (jQuery/jQuery UI, no component framework, no router): markup lives in
`index.html`, each `src/js/<name>.js` exports an `init*()` that wires a section of it, imported once from
`src/main.js`. Read `ageGate.js` / `discord-link-init.js` as references; strings go through `t(key, params,
fallback)` from `src/js/i18n.js`. Test: `__tests__/js/<name>.test.js`.

## Bundle and build config (deliberate — don't "harden" back to defaults)

- `bun run build:analyze` (= `ANALYZE=true vite build`) writes and opens `stats.html` (git-ignored)
- Not in the bundle: the original engine (`src/js/migrator/`, ~270 classic scripts) is copied untouched to
  `dist/legacy/` by `scripts/legacyEnginePlugin.js` and loaded at runtime by `src/js/legacyEngine.js` (until
  migrated, `legacy-to-esm` skill); game media (`resources/`) is published to R2 with `bun run package:assets`
- `import * as Sentry` is fine in `src/instrument.js` (configures the SDK); other modules import named
  functions or use its `logger`. `syncAssets` is lazy-loaded by `src/main.js` (native builds, after the age gate)
- Vite 8 = Rolldown: `build.rolldownOptions.output.codeSplitting.groups` = `tauri` (`/@tauri-apps/`), then
  `jquery-ui` (`/node_modules\/jquery-ui\/ui\//` only — matching the whole package would pull the theme CSS
  into the chunk and load jQuery UI before `window.jQuery` exists), then `vendor`. Add heavy libs above
  `vendor`; never widen the `jquery-ui` test

| Setting | Value | Why |
|---|---|---|
| `sourcemap` | `'hidden'` | Uploaded to Sentry by `sentryVitePlugin`, not referenced by shipped files |
| `minify` | `'terser'` (off when `TAURI_ENV_DEBUG`) | `drop_console: ['log']`, `passes: 2`, `mangle.toplevel` |
| `target` / `cssTarget` | `edge100`, `chrome100`, `firefox100`, `safari15` | `.browserslist` and the oldest WebViews (WebKitGTK, old Android) |
| `cssCodeSplit` | `false` | One stylesheet in the import order of `src/main.js` |
| `assetsInlineLimit` | `2048` | |
| `chunkSizeWarningLimit` | `800` | kB, uncompressed |
| `modulePreload.polyfill` | `false` | Old Safari only loses the preload hint |

- Dev server: `server.watch.usePolling` only for Android dev (`TAURI_ENV_PLATFORM === 'android'`);
  `resources/` (15k+ files), `dist/` and `src-tauri/` excluded from watching.
  `scripts/legacyEnginePlugin.js` reads `original-js-loaded.txt` once per build

## Dependencies

- `postcss-px-to-viewport-8-plugin` is pinned to `1.2.5` and patched (`patchedDependencies`, `patches/`):
  re-check the patch on any version change (or drop it if the landscape-rules bug is fixed upstream), else
  `bun install` fails
- Commit `bun.lock` and `src-tauri/Cargo.lock`: every `zip` 4.x needed by `tauri-plugin-updater` was yanked
  (see the comment in `src-tauri/Cargo.toml`)
- Post-update: `bun run typecheck && bun run lint && bun run test:coverage`, `cargo build` in `src-tauri/`,
  `bun run test:e2e` (the legacy engine must still start)

## Release build

- bun-exclusive (`bun.lock`, `packageManager: bun@1.4.3`): no separate Node prerequisite. Install bun with
  `powershell -c "irm bun.sh/install.ps1 | iex"`, update with `bun upgrade`; `bun install --ignore-scripts`
- Updater: `createUpdaterArtifacts: true` → `TAURI_SIGNING_PRIVATE_KEY` (+ password) required
- Web: `bun run build` / `bun run preview`; `VITE_ASSETS_BASE_URL` required, `VITE_SENTRY_DSN` optional
- Windows: `bun run tauri:build` → `src-tauri/target/release/bundle/nsis/*.exe` + `.exe.sig`
- Linux: `bun run tauri:build:linux` → deb, rpm, AppImage (+ `.AppImage.sig`)
- Android: `bun run tauri:android:build` (`--apk --target aarch64`) →
  `src-tauri/gen/android/app/build/outputs/apk/aarch64/release/app-aarch64-release.apk`; debug:
  `bun tauri android build --target aarch64 --apk --debug`; keystore in `src-tauri/gen/android/keystore.properties`
- GitHub release `v<version>` asset names (used by `website/site.js`, `website/index.html`, `README.md`):

  | Platform | Asset name |
  |---|---|
  | Windows | `HatMP-windows-x64-setup.exe` (+ `.sig`) |
  | Android | `HatMP-android-arm64.apk` |
  | Linux | `HatMP-linux-x64.AppImage` (+ `.sig`), `HatMP-linux-x64.deb`, `HatMP-linux-x64.rpm` |

- Updater manifest, after renaming:
  `node scripts/updater-manifest.js --platform windows-x86_64 --file HatMP-windows-x64-setup.exe --out latest.json`
  (`--merge <other latest.json>`, `--notes "..."`), then attach `latest.json` to the release. No in-app update on Android

## Updater (state)

- Installed and configured: `@tauri-apps/plugin-updater`; `tauri-plugin-updater` with
  `default-features = false` (no `zip` feature — every `zip` 4.x it needed is yanked), registered under
  `#[cfg(desktop)]` in `src-tauri/src/lib.rs`; `updater:default` in `capabilities/default.json`;
  `plugins.updater` with `windows.installMode: "passive"` and the endpoint
  `https://github.com/avuillet93TheFrenchy/HatMP/releases/latest/download/latest.json`
- Private key: `~/.tauri/hatmp.key`
- Wrapper `src/tauri/updater.js`: `updaterCheck` (resolves to `null` in a browser tab and on Android),
  `updaterDownloadAndInstall`, `updaterClose`, `UpdaterError`; relaunch with `processRelaunch` from
  `@tauri/process.js`, log with `logError` from `@tauri/log.js`
- **Not done yet: the update UI** — nothing in `src/` calls the wrapper. Call it after the age gate and the
  asset sync; texts through `t()`; test like `__tests__/js/*.test.js`, mocking `@tauri/updater.js`

## SonarQube Cloud

`sonar-project.properties` is not in the repository (nor `.sonarlint/connectedMode.json`, git-ignored).
Values used before (to check in SonarQube Cloud before re-creating the file):

```properties
sonar.projectKey=avuillet93TheFrenchy_HatMP
sonar.organization=avuillet93thefrenchy
sonar.projectName=HatMP
sonar.sources=src,scripts,website,index.html
sonar.tests=__tests__
sonar.test.inclusions=__tests__/**/*.test.js,__tests__/**/*.spec.js
sonar.exclusions=node_modules/**,coverage/**,dist/**,src-tauri/**,src/local/**,**/*.config.js,**/*.config.ts,**/*.config.mjs,**/*.config.cjs
sonar.coverage.exclusions=src/js/migrator/**,scripts/sync-agents.js,website/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
# The original engine uses Math.random() for gameplay only (S2245)
sonar.issue.ignore.multicriteria=r1
sonar.issue.ignore.multicriteria.r1.ruleKey=javascript:S2245
sonar.issue.ignore.multicriteria.r1.resourceKey=src/js/migrator/**/*.js
```

`src/js/migrator/` issues are expected (FF5's original code, being migrated): report them separately.

## Vite config (departures from the Tauri template — keep them)

- Single config file `vite.config.ts`. Dev host = `PC_IP_ADDRESS || TAURI_DEV_HOST` (`PC_IP_ADDRESS` in
  `.env.local`, read with `loadEnv(..., '')`); `bun run tauri:android:dev` (`scripts/tauri-android-dev.js`)
  passes it as `--host`
- Ignored by the watcher: `resources/`, `dist/`, `src-tauri/`, `gen/`, the `audit-images.*` outputs
- Plugins: `vite-plugin-image-optimizer`, `scripts/legacyEnginePlugin.js` (`virtual:legacy-engine`),
  `scripts/auditImagesPlugin.js` (dev only), Sentry's plugin (production), visualizer behind `ANALYZE=true`
- Aliases are regex entries (`{ find: /^@js\/(.+)$/, replacement: `${jsDir}/$1` }`), mirrored in
  `tsconfig.json` `paths`; `vitest.config.ts` merges this file
- `define`: `import.meta.env.VITE_APP_VERSION` = `package.json` version (Sentry `release`)
- No SCSS `additionalData`: partials are imported explicitly

## Tauri capabilities

- `keep-screen-on` is a local plugin (`src-tauri/plugins/tauri-plugin-keep-screen-on/`, `path` dependency,
  JS side `src/tauri/keep-screen-on.js` via `invoke('plugin:keep-screen-on|...')`)
- `sentry:*` comes from `tauri-plugin-sentry` (npm: `tauri-plugin-sentry-api`)
- `default.json` (Windows, Linux, Android) and `desktop.json` (Windows, Linux: `window-state`);
  `window-state` and `single-instance` under `cfg(not(target_os = "android"))`, `updater` under `cfg(desktop)`
- Past incident: `tauri-plugin-process` registered and granted but missing from `Cargo.toml`
- Needed scopes: `fs:default` + `fs:allow-applocaldata-{read,write,meta}-recursive` (assets in
  `$APPLOCALDATA/assets`, written by the Rust `download_and_extract_pack`, read by `src/js/resourceLoader.js`);
  `http` scoped to `https://assets.hatmp.com` (asset packs, `config/discord.json`, must match the CSP
  `connect-src`); `opener:default` (external links); `process:allow-exit` (age gate "I am a minor")
