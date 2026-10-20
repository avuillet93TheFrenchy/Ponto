---
name: perf-analyzer
description: Use when analyzing performance of a JS/web app - bundle size, Vite build optimization, DOM re-renders, framework rendering, memory usage, and Tauri invoke call frequency for Tauri apps.
---

# Perf Analyzer

Analyzes and optimizes the performance of the current application (bundle + DOM + framework rendering, and Tauri `invoke` when relevant).

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<src>`, `<run>`, `scripts.build`, `stack.vite`, `stack.tauri`, `stack.frameworks`, `bundleBudget`. Skip the `invoke` section when `stack.tauri` is false. Read the `conventions` files: build settings the project documents as deliberate must not be "optimized" back to defaults.

## Workflow

1. Ask for the scope: `bundle`, `dom`, `framework`, `invoke` (Tauri), `vite-config`, or `all` (default: `all`)
2. Analyze the chosen scope
3. Identify issues by priority (critical / medium / low)
4. Suggest concrete optimizations with code examples

## 1. Vite Bundle Analysis

### Generate bundle stats

Use the project's analyze script if it has one (`<run> build:analyze`...); otherwise see the
`bundle-optimizer` skill, which covers the bundle in depth (visualizer setup, chunk splitting, deliberate
build settings): defer to it for any change to the bundler config.

### What to look for

| Issue                  | Symptom                       | Solution                                          |
| ---------------------- | ----------------------------- | ------------------------------------------------- |
| Full library import    | `lodash` imported entirely    | Named import: `import { debounce } from 'lodash'` |
| Non-tree-shaken code   | Unused modules in the bundle  | Check imports using `*`                           |
| Chunk too large        | A file > 500KB                | Dynamic `import()` for lazy loading               |
| Duplicate dependencies | Same lib in multiple versions | `<pm> dedupe` (npm, pnpm, bun; yarn: `yarn dedupe`) |

## 2. Tauri invoke Call Analysis (only when `stack.tauri`)

### Patterns to detect

```js
// ❌ Issue: invoke inside a loop
for (const item of items) {
    await invoke('process_item', { item }); // N network calls
}

// ✅ Solution: batch the calls
await invoke('process_items', { items }); // 1 call

// ❌ Issue: invoke without debounce on user input
input.addEventListener('input', async (e) => {
    await invoke('search', { query: e.target.value }); // call on every keystroke
});

// ✅ Solution: debounce (reuse the project's helper if it has one, otherwise a small local helper
// colocated in the calling module — don't invent an alias)
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

input.addEventListener(
    'input',
    debounce(async (e) => {
        await invoke('search', { query: e.target.value });
    }, 300)
);

// ❌ Issue: payload too large
await invoke('save_data', { data: entireAppState }); // potentially MB of data

// ✅ Solution: send only the delta
await invoke('save_data', { data: changedFields });
```

### Metrics to measure

```js
// Temporary measurement wrapper (remove after analysis)
async function invokeWithTiming(cmd, args) {
    const start = performance.now();
    const result = await invoke(cmd, args);
    const duration = performance.now() - start;
    if (import.meta.env.DEV) {
        console.debug(`[invoke:${cmd}] ${duration.toFixed(2)}ms`, args);
    }
    return result;
}
```

## 3. DOM Re-render Analysis

### Patterns to detect

```js
// ❌ Issue: innerHTML in a loop (forces reflow on every iteration)
items.forEach((item) => {
    container.innerHTML += `<div>${item.name}</div>`;
});

// ✅ Solution: DocumentFragment (single reflow)
const fragment = document.createDocumentFragment();
items.forEach((item) => {
    const div = document.createElement('div');
    div.textContent = item.name;
    fragment.appendChild(div);
});
container.appendChild(fragment);

// ❌ Issue: alternating reads and writes (forced layout thrashing)
items.forEach((item) => {
    const height = item.el.offsetHeight; // read (forces layout)
    item.el.style.height = height + 10 + 'px'; // write (invalidates layout)
});

// ✅ Solution: separate reads and writes
const heights = items.map((item) => item.el.offsetHeight); // all reads
items.forEach((item, i) => {
    item.el.style.height = heights[i] + 10 + 'px'; // all writes
});
```

## 4. Framework Rendering (when `stack.frameworks` is not empty)

- React/Preact: unstable props (inline objects/functions) in hot lists, missing `key`, heavy work in render
  without `useMemo`, effects that set state on every render
- Vue: expensive getters instead of `computed`, deep watchers on large objects, `v-if` + `v-for` on the same node
- Svelte: reactive statements recomputing large derived data; prefer derived stores/`$derived`

Measure with the framework devtools profiler before changing code.

## 5. Build Config Optimization (Vite or the project's bundler)

Read the build config and the conventions first: settings documented as deliberate (source maps for an
error tracker, CSS order, targets matching `.browserslist`, custom chunking) must be kept — flag only what
deviates from them. Then check:

- Production `build.target` matches the browsers/WebViews actually supported
- Minification on, `console.log` dropped in production if the project wants it
- Source maps: `'hidden'` when uploaded to an error tracker, otherwise usually `false`
- Chunking: Vite ≤ 7 (Rollup) uses `build.rollupOptions.output.manualChunks`; Vite 8+ (Rolldown) uses
  `build.rolldownOptions.output.codeSplitting.groups` — check the installed version before proposing either
- Dev server: large folders (assets, build output, `<tauri>/`) excluded from `server.watch` when polling is on

## Report Format

For each identified issue:

```
⚠️ [Category] Issue title
   File  : <src>/myFile.js:42
   Impact: critical / medium / low
   Description: explanation
   Fix   : corrected code
```

## Analysis Priority

1. invoke calls inside loops or without debounce (critical, Tauri)
2. Chunks above the bundle budget (high)
3. Layout thrashing in DOM manipulations / render loops (high)
4. Non-tree-shaken imports (medium)
5. Build config not optimized for production (low)

## Scope and Cross-References

- For generating performance tests → `gen-test`
- For quality review of corrected code → `code-reviewer`
- For analyzing heavy dependencies → skill `deps-checker`
