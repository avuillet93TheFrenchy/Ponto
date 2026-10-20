---
name: testing-debugging-helper
description: Test creation and debugging automation for JS/TS web applications (Vite, Vitest or Jest, Playwright, and Tauri when used). Use this skill to create unit tests, integration tests, analyze errors, add debugging logs, configure debugging tools, or identify common bugs.
---

# Testing & Debugging Helper

## Mission

Assist with test creation and debugging for the current JS/TS application, providing:

1. **Unit test creation** — via Vitest (complex cases with advanced mocks)
2. **Integration test creation** — multi-component scenarios
3. **Error analysis with suggestions** — diagnosis and fixes
4. **Strategic debugging logs** — optimal log placement
5. **Debugging tool configuration** — complete setup
6. **Common bug identification** — frequent problematic patterns

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<src>`, `<tests>`, `<run>`, `<exec>`, `scripts.*`,
`stack.vitest`/`stack.jest`/`stack.playwright`/`stack.tauri`. Read the test runner config and setup files, and
the `conventions` files and `notes`. Sections about Tauri apply only when `stack.tauri`; with Jest, read
`vi.*` as `jest.*`.

## Scope and referrals

- For **quick unit test generation** on a file → use the skill `gen-test` (faster and more targeted)
- For **Playwright E2E tests** (complete user flows) → use the skill `gen-test-e2e`
- For a **security audit** of the code → use the skill `security-reviewer`
- For a **quality review** of the code → use the agent `code-reviewer`

---

## 1. Unit test creation (Vitest)

### Workflow

1. Read the source file to test
2. Identify exported functions/classes
3. Generate the test file following the project's layout (mirrored under `<tests>` or co-located —
   look at existing tests, see `gen-test`)
4. Cover: normal cases, error cases, edge cases

### Conventions

- Import `describe`/`it`/`expect`/`vi` from `'vitest'` unless `globals: true` is configured
- Environment: the one configured in the runner config (jsdom, happy-dom, node)
- Test names in English
- Import the module under test like the existing tests do; only use aliases that exist in the config

### Unit test structure

```js
import { myFunction } from '../src/myFile.js';

describe('myFunction', () => {
    beforeEach(() => {
        // Setup before each test
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Always restore mocks
    });

    it('should return expected value for valid input', () => {
        expect(myFunction('input')).toBe('expected');
    });

    it('should handle null/undefined gracefully', () => {
        expect(myFunction(null)).toBeUndefined();
        expect(myFunction(undefined)).toBeUndefined();
    });

    it('should throw on invalid input', () => {
        expect(() => myFunction(-1)).toThrow('Invalid input');
    });

    it('should call dependency once', () => {
        const mockDep = vi.fn().mockReturnValue('mocked');
        expect(mockDep).toHaveBeenCalledOnce();
    });
});
```

### Commands

```bash
# Run a specific test
<exec> vitest run <test file>          # Jest: <exec> jest <test file>

# Run all tests with coverage (fails below the configured thresholds)
<run> <scripts.coverage>

# Watch mode (development)
<exec> vitest              # watch mode by default in a terminal

# E2E (Playwright, see the gen-test-e2e skill)
<run> <scripts.e2e>
```

---

## 2. Integration test creation

### Difference from unit tests

- **Unit**: tests a single isolated function/module
- **Integration**: tests the interaction between multiple modules/components

### Workflow

1. Identify multi-component flows to test
2. Create the file following the project's test layout (e.g. `<tests>/<name>.integration.test.js`)
3. Mock external dependencies (API, localStorage, Tauri)
4. Test complete flows

### Mocking Tauri APIs

This project is Tauri **v2** — mock the v2 module paths, not the removed v1 ones (`@tauri-apps/api/tauri`,
`@tauri-apps/api/fs` no longer exist):

```js
// Mock the Tauri core (invoke)
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}));

// Mock the Tauri filesystem plugin
vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: vi.fn().mockResolvedValue('file content'),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
}));

import { invoke } from '@tauri-apps/api/core';

describe('Integration: Save flow', () => {
    beforeEach(() => {
        invoke.mockResolvedValue({ success: true });
    });

    it('should save and reload data correctly', async () => {
        // Arrange
        const data = { title: 'Test', content: 'Content' };

        // Act
        await saveData(data);
        const loaded = await loadData();

        // Assert
        expect(loaded).toEqual(data);
        expect(invoke).toHaveBeenCalledWith('save_data', { data });
    });
});
```

### Mocking localStorage

```js
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = String(value);
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
```

---

## 3. Error analysis with suggestions

### Diagnostic workflow

1. Read the complete error message (including stack trace)
2. Identify the error type
3. Locate the source in the code
4. Propose fixes

### Common error types and fixes

#### TypeError: Cannot read properties of undefined

```js
// ❌ Problem
const value = obj.property.nested;

// ✅ Fix with optional chaining
const value = obj?.property?.nested;

// ✅ Fix with default value
const value = obj?.property?.nested ?? 'default';
```

#### Unhandled promise rejection

```js
// ❌ Problem
fetch('/api/data')
    .then((r) => r.json())
    .then(setData);

// ✅ Fix
fetch('/api/data')
    .then((r) => r.json())
    .then(setData)
    .catch((err) => {
        console.error('Fetch error:', err);
        setError(err.message);
    });
```

#### Tauri error: command not found

```js
// ❌ Problem
await invoke('my_command'); // Command not registered on the Rust side

// Things to check:
// 1. The command exists somewhere under <tauri>/src/ (e.g. <tauri>/src/commands.rs)
// 2. It is registered in the invoke_handler(tauri::generate_handler![...]) call in <tauri>/src/lib.rs
// 3. Names match exactly (snake_case on the Rust side)
// 4. The calling capability file under <tauri>/capabilities/*.json grants the command
```

#### Module not found with path alias

```js
// ❌ Problem
import { fn } from '@js/helper'; // Alias not resolved

// Check in vite.config.ts's resolve.aliases array — this project only defines
// @tauri, @tauri/*, @js/*, @scss/*, @locales/*, and @ (there is no @utils/@components alias)
// vitest.config.ts merges vite.config.ts via mergeConfig(), so aliases don't need repeating there
```

---

## 4. Strategic debugging logs

### Placement principle

Place logs at **decision points** and **module boundaries**, not everywhere.

### Recommended log levels

```js
// 🔴 Critical errors (always in production)
console.error('[MyModule] Operation failed:', { context, error });

// 🟡 Warnings (unexpected but recoverable behavior)
console.warn('[MyModule] Unexpected value:', { value, expected });

// 🟢 Info (main flow, prod if necessary)
console.info('[MyModule] Action performed:', { action, result });

// 🔵 Debug (development only)
if (import.meta.env.DEV) {
    console.debug('[MyModule] Internal state:', { state });
}
```

### Structured log pattern

```js
// Create a logger with context
const createLogger = (module) => ({
    log: (msg, data) => console.log(`[${module}] ${msg}`, data),
    error: (msg, data) => console.error(`[${module}] ${msg}`, data),
    debug: (msg, data) => {
        if (import.meta.env.DEV) console.debug(`[${module}] ${msg}`, data);
    },
});

// Usage
const logger = createLogger('AudioPlayer');
logger.log('Track changed', { from: prevTrack, to: newTrack });
logger.error('Playback failed', { error, trackId });
```

### Optimal log placement

```js
async function processData(input) {
    console.debug('[processData] Start', { input }); // Entry point

    try {
        const result = await fetchData(input);
        console.debug('[processData] Fetch success', { result }); // After async

        const processed = transform(result);
        console.debug('[processData] Transform done', { processed }); // After processing

        return processed;
    } catch (err) {
        console.error('[processData] Failed', { input, error: err.message }); // Error
        throw err;
    }
}
```

---

## 5. Debugging tool configuration

### Vite DevTools (browser)

`vite.config.ts` already ships build source maps (`build.sourcemap: 'hidden'`, plus `css.devSourcemap`
disabled only in production builds) — no extra config needed for local debugging. Don't add a separate
`vite.config.js`; this project has a single `vite.config.ts`.

### Vitest configuration with debugging

`vitest.config.ts` already exists and covers jsdom, `setupFiles`, coverage thresholds, and — via
`mergeConfig(viteConfig, ...)` — inherits all of `vite.config.ts`'s aliases (`@`, `@js`, `@tauri`, `@scss`,
`@locales`; no `@utils`/`@components`). To get more verbose test output while debugging, pass flags at the CLI
rather than editing the config:

```bash
<exec> vitest run <test file> --reporter=verbose
```

### Tauri debugging (Rust + WebView)

```bash
# Run in debug mode with visible Rust logs
RUST_LOG=debug <exec> tauri dev

# Or on Windows
$env:RUST_LOG="debug"; <exec> tauri dev
```

```rust
// In Rust code, use log macros
use log::{debug, error, info, warn};

#[tauri::command]
fn my_command(input: String) -> Result<String, String> {
    debug!("my_command called with: {}", input);
    // ...
}
```

---

## 6. Common bug identification

### Frequent bugs in JS + Vite + Tauri

| Bug                      | Symptom                              | Solution                                    |
| ------------------------ | ------------------------------------ | ------------------------------------------- |
| Race condition           | Inconsistent data depending on speed | Missing `await`, or use `Promise.all`       |
| Duplicate event listener | Action triggered multiple times      | Check re-registration, use `{ once: true }` |
| Memory leak              | Progressive slowdown                 | Clean up listeners in cleanup/destroy       |
| Shared mutable state     | Hard-to-reproduce bug                | Immutability, copy with spread `{...obj}`   |
| Circular import          | Module undefined at runtime          | Restructure dependencies                    |
| Tauri command blocked    | `invoke()` rejects with a permission error | v2 has no `allowlist` — grant the command in the relevant `<tauri>/capabilities/*.json` (see `tauri-v2-capability` skill) |
| Hot reload broken        | Vite not reloading                   | Check dynamic imports, restart              |

### Detection pattern: Race condition

```js
// ❌ Race condition
let data = null;
fetchUser().then((u) => (data = u));
fetchPosts().then((p) => render(data, p)); // data can be null!

// ✅ Fix
const [user, posts] = await Promise.all([fetchUser(), fetchPosts()]);
render(user, posts);
```

### Detection pattern: Memory leak

```js
// ❌ Memory leak
function init() {
    window.addEventListener('resize', handleResize);
    // handleResize is never removed
}

// ✅ Fix with cleanup
function init() {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
}
```

---

## Debugging checklist

Before declaring a bug resolved:

- [ ] The bug is consistently reproducible
- [ ] The root cause is identified (not just a symptom)
- [ ] The fix is tested with a unit test
- [ ] Temporary debug logs are removed
- [ ] No regressions introduced (existing tests pass)
- [ ] The fix works in the real app (`<run> <scripts.dev>`, or `<exec> tauri dev` for Tauri apps)
