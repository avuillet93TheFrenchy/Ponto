---
name: bundle-optimizer
description: Use when reducing the production bundle size of a Vite (or other bundler) project - code splitting, lazy loading, tree-shaking, dependency deduplication, or chunk analysis.
---

# Bundle Optimizer

Analyzes and optimizes the production bundle size of the current project.

> For runtime performance (DOM re-renders, Tauri invoke calls), use `perf-analyzer` instead.

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<run>`, `<exec>`, `commands.add`,
`scripts.build`, `stack.vite`, `bundleBudget`. Then read the bundler config (`vite.config.*`) and the
`conventions` files: **settings documented as deliberate are kept**, and code the project ships outside
the bundle (legacy scripts copied as-is, media on a CDN) is not something to optimize here.

## Workflow

1. Run a production build with the bundle visualizer
2. Identify the top issues by impact
3. Apply fixes (see categories below)
4. Rebuild and compare

## 1. Visualize the Bundle

If the project already has an analyze script (`build:analyze`, `analyze`...), use it. Otherwise, with Vite,
propose adding `rollup-plugin-visualizer` behind an env flag (ask before adding a dependency):

```ts
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
    plugins: [
        process.env.ANALYZE === 'true' &&
            visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true, open: true }),
    ],
});
```

```bash
ANALYZE=true <run> <scripts.build>   # writes stats.html — add it to .gitignore
```

Look for large rectangles (oversized chunks). If the production build uploads source maps (Sentry...),
tell the user before building.

## 2. Common Issues and Fixes

### Non-tree-shaken imports

```js
// ❌ Imports a whole namespace when one function is used
import * as _ from 'lodash';
// ✅ Named imports from an ESM build
import { debounce } from 'lodash-es';
```

### Large dependency loaded synchronously

```js
// ❌ Loaded on every start although only one screen uses it
import { renderChart } from './charts.js';

// ✅ Lazy load when the screen opens
const { renderChart } = await import('./charts.js');
```

Framework equivalents: `React.lazy` + `Suspense`, Vue `defineAsyncComponent` / lazy routes, SvelteKit/Next
route-level splitting.

### Vendor code splitting

Check the installed Vite version first (`<exec> vite --version`):

- **Vite ≤ 7 (Rollup)**: `build.rollupOptions.output.manualChunks`
- **Vite 8+ (Rolldown)**: `build.rolldownOptions.output.codeSplitting.groups` (`manualChunks` is ignored);
  the first matching group wins, so put specific groups above a catch-all `node_modules` one

```ts
codeSplitting: {
  groups: [
    { test: /node_modules\/@sentry/, name: 'sentry' },
    { test: /node_modules/, name: 'vendor' },
  ],
},
```

Don't widen or reorder groups the project documents as deliberate (a group that must not pull CSS or
load before a global exists, for instance).

### Duplicate dependencies

```bash
<pm> dedupe              # npm / pnpm / bun; yarn: yarn dedupe
<pm> ls <package-name>   # see which versions are installed and why (bun: bun pm ls)
```

## 3. Build Config

Review the `build` block against the project's documented choices before changing anything:

| Setting | Typical choice | Note |
|---|---|---|
| `sourcemap` | `'hidden'` with an error tracker, else `false` | `false` makes production stack traces unreadable when a tracker is used |
| `minify` | `'esbuild'` (default) or `'terser'` | Terser allows `drop_console`, extra passes |
| `target` / `cssTarget` | match `.browserslist` / supported WebViews | too modern breaks old WebViews; too old bloats |
| `cssCodeSplit` | default `true` | some projects need `false` to keep one cascade order |
| `assetsInlineLimit` | 4096 default | lower it if many small images bloat JS |
| `chunkSizeWarningLimit` | 500 kB default | raise only with a reason |

## 4. Size Budget

Use `bundleBudget` from the profile; otherwise:

| Asset type         | Warning threshold | Action                               |
| ------------------ | ----------------- | ------------------------------------ |
| Initial JS chunk   | > 200KB (gzip)    | Split or lazy load                   |
| Vendor chunk       | > 150KB (gzip)    | Check for unused exports             |
| CSS                | > 50KB            | Check for unused rules               |
| Total initial load | > 500KB           | Critical — refactor loading strategy |

## Report Format

```
[HIGH/MEDIUM/LOW] Issue title
  Chunk   : vendor.js (382KB gzip)
  Cause   : lodash imported without tree-shaking
  Saving  : ~65KB estimated
  Fix     : switch to lodash-es with named imports
```

## Checklist

- [ ] Bundle visualizer generated and reviewed
- [ ] No library imported with `import lib from '...'` when `import { fn }` is possible
- [ ] Heavy libraries (charts, editors) are lazy-loaded
- [ ] Heavy vendor libraries in their own chunk, using the API of the installed Vite version
- [ ] Duplicates removed with the package manager's dedupe
- [ ] Settings documented as deliberate left as they are

## Scope and Cross-References

- For runtime performance → `perf-analyzer`
- For reviewing new dependencies before adding → `deps-checker`
- For final production build → `build-release`
