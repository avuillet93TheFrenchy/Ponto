---
name: vite-tauri-config
description: Configure or troubleshoot Vite when it's the frontend bundler for a Tauri v2 application. Use when the user mentions "vite config", "vite.config", "tauri dev server", "5173", "clearScreen", "HMR Tauri", "Vite ne marche pas avec Tauri", "build vite tauri", "configurer vite", or when Tauri's dev server cannot connect to Vite, hot reload is broken, or the production build is too large.
---

# Vite + Tauri v2 Configuration

Vite is the recommended frontend tooling for Tauri v2 projects scaffolded via `create-tauri-app`. The two must agree on host, port, and HMR settings.

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`): `<run>`, `scripts.dev`/`scripts.build`, `<tauri>`, `stack.typescript`. **Read the real `vite.config.*` and the `conventions` files before changing anything**: settings the project documents as deliberate (dev host, watch exclusions, chunking, plugins, aliases) are kept.

Authoritative sources used in this skill:

- [Tauri v2 — Vite integration guide](https://v2.tauri.app/start/frontend/vite/)
- [Vite — Server options](https://vite.dev/config/server-options)
- [Vite — Build options](https://vite.dev/config/build-options)

## When to use

- Setting up Vite for a new Tauri v2 project
- Tauri's dev window shows a blank page or "ECONNREFUSED" against the dev server
- HMR (hot reload) does not work, or full reloads happen on every edit
- The production bundle is too large
- The user wants to add path aliases, env vars, or asset handling

## Required Vite settings for Tauri

Per the official [Tauri Vite guide](https://v2.tauri.app/start/frontend/vite/), the following settings must be present in the Vite config (`vite.config.ts` or `.js` — check which one exists):

```javascript
import { defineConfig } from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
    // Don't clear the terminal so Rust panics from `tauri dev` stay visible
    clearScreen: false,

    server: {
        // Tauri expects a fixed port; fail fast if unavailable
        port: 5173,
        strictPort: true,
        // Required for mobile development (TAURI_DEV_HOST is set by `tauri dev --host`)
        host: host || false,
        hmr: host
            ? {
                  protocol: 'ws',
                  host,
                  port: 1421,
              }
            : undefined,
        // Don't watch the Tauri folder — it's the Rust side
        watch: {
            ignored: ['**/src-tauri/**'],
        },
    },

    // Vite envs prefixed with TAURI_ENV_* end up in tauri::env::vars()
    envPrefix: ['VITE_', 'TAURI_ENV_*'],

    build: {
        // Tauri uses Chromium on Windows/Linux and WebKit on macOS/iOS — pick conservative targets
        target:
            process.env.TAURI_ENV_PLATFORM === 'windows'
                ? 'chrome105'
                : 'safari13',
        // Don't minify in dev builds for readable errors
        minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
        sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
}));
```

The keys above are taken verbatim from the official Tauri Vite guide. Verify against https://v2.tauri.app/start/frontend/vite/ if values appear to have changed.

### Common, legitimate departures from the template (keep them when present)

- **Dev host** overridden by an env var (e.g. a LAN IP in `.env.local`) because the Tauri CLI may pick a
  network adapter the phone cannot reach
- **Watching**: `usePolling` for Android dev only, and large folders (assets, `dist/`, the Tauri folder,
  generated files) in `server.watch.ignored`
- **Build**: Vite 8 bundles with **Rolldown** (`build.rolldownOptions.output.codeSplitting`; Rollup's
  `rollupOptions.output.manualChunks` is ignored), Vite ≤ 7 with Rollup; `sourcemap: 'hidden'` for an error
  tracker; explicit `target`/`cssTarget` matching `.browserslist` — see `bundle-optimizer`
- **Aliases** in `resolve.alias`, mirrored in `tsconfig.json`/`jsconfig.json` `paths`; a `vitest.config.*`
  that merges the Vite config inherits them
- **`define`**: build-time constants such as the app version for an error tracker's `release`

## Required `tauri.conf.json` settings

The frontend build settings in `tauri.conf.json` must match the Vite output:

```json
{
    "build": {
        "beforeDevCommand": "<run> dev",
        "beforeBuildCommand": "<run> build",
        "devUrl": "http://localhost:5173",
        "frontendDist": "../dist"
    }
}
```

Use the package manager's `run` form (`bun run build`, `npm run build`...). With bun, never `bun build`:
it is Bun's own native bundler (a built-in command that takes precedence over the `build` script), not
`vite build`. Check `<tauri>/tauri.conf.json` for that mistake when `tauri build` fails before Rust even compiles.

`devUrl` must match Vite's `server.port`. `frontendDist` is relative to `<tauri>/` and must match Vite's `build.outDir` (default `dist`). Source: [Tauri configuration reference](https://v2.tauri.app/reference/config/).

## Common issues

### Blank window in `tauri dev`

Check in order:

1. Vite dev server is actually running on 5173 (`curl http://localhost:5173`)
2. `tauri.conf.json` `build.devUrl` matches port 5173
3. No firewall blocking localhost:5173
4. CSP in `tauri.conf.json` is not blocking Vite's HMR websocket (allow `ws://localhost:5173` and `ws://localhost:1421` if `connect-src` is restrictive)

### HMR not working

- `strictPort: true` is set
- For mobile dev (`tauri dev --host`), `TAURI_DEV_HOST` env var is set automatically by the CLI; the config above wires HMR through it
- WebSocket connection to `localhost:1421` not blocked

### Production bundle too large

This skill doesn't cover bundle optimization — that's a separate concern with its own techniques (tree-shaking, lazy imports, manual chunking, vendor splitting, bundle visualization).

**Defer to the `bundle-optimizer` skill** for:

- Adding `rollup-plugin-visualizer` and reading `stats.html`
- Splitting vendor code via `build.rolldownOptions.output.codeSplitting.groups` (Vite 8 / Rolldown)
- Converting full-library imports to named imports
- Lazy-loading heavy dependencies
- Tuning `build.minify`, `build.target`, `chunkSizeWarningLimit`

The base config above is intentionally minimal — it ensures Vite and Tauri talk to each other correctly, nothing more. Optimization is a separate pass.

### Path aliases

Add an alias the way the existing ones are written in `resolve.alias` (object or array/regex form), and
mirror it in `tsconfig.json`/`jsconfig.json` `paths` so type-checking resolves it:

```ts
resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
```

If using SCSS, a global `additionalData` auto-import is one option — check the `css` block first: many
projects import their partials explicitly instead. Vite's SCSS support is zero-config once
`sass`/`sass-embedded` is installed.

```javascript
css: {
  preprocessorOptions: {
    scss: {
      additionalData: `@use "@/styles/_variables.scss" as *;`,
    },
  },
}
```

## Report back

After editing, list:

- File paths modified
- Settings added or changed
- Any platform-specific consideration the user should verify

Don't introduce settings beyond what the user requested unless the existing config is broken — then explain why a change is needed and cite the relevant docs URL.
