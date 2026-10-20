---
name: gen-test
description: Use when generating unit tests (Vitest or Jest) for a JS/TS source file. Analyzes the file, identifies exported functions, and generates unit tests for each of them, following the project's test layout.
---

# Unit Test Generator (Vitest / Jest)

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `<src>`, `<tests>`, `<run>`/`<exec>`,
`scripts.test`/`scripts.coverage`, `coverage`, `stack.vitest`/`stack.jest`/`stack.typescript`/`stack.tauri`.
Then read:

- The runner config (`vitest.config.*`, the `test` block of `vite.config.*`, or `jest.config.*`):
  `globals`, `environment` (jsdom/happy-dom/node), `setupFiles`, `mockReset`/`restoreMocks`, coverage thresholds
- The setup file(s) — they may already mock modules (e.g. `@tauri-apps/*`): don't mock them twice
- One or two existing tests next to similar sources — **copy their layout and style**
- The `conventions` files and `notes` (file headers, naming, exceptions)

## Workflow

1. Ask which source file to test (or use the provided argument)
2. Read the source file and identify exported functions / classes
3. Create the test file following the project's layout:
   - mirrored tree: `<src>/a/b.js` → `<tests>/a/b.test.js`
   - or co-located: `<src>/a/b.test.js`
   - same language as the source (TS source → `.test.ts`)
4. Use the project conventions:

- Import `describe`/`it`/`expect`/`vi` from `'vitest'` **unless** `globals: true` is configured (Jest: globals by default)
- Import the module under test the way existing tests do (relative path or alias)
- Mock the module's side-effect dependencies (`vi.mock` / `jest.mock`): network, storage, platform APIs.
  Tauri projects: mock `@tauri-apps/api/*` and plugins unless the setup file already does
- When mocks are reset after each test (`mockReset`), set return values in `beforeEach` or in the test
- A module that does its work when imported runs once per registry: re-import it after
  `vi.resetModules()` / `jest.resetModules()`; change `import.meta.env` with `vi.stubEnv()`
- Node-only code (scripts, config) runs in the `node` environment (`// @vitest-environment node`)
- Test names in English
- Cover basic cases, error cases, and edge cases

## Scope and referrals

This skill covers only **unit tests** (a single isolated function/module).

- For integration tests, debugging, or error analysis → use the skill `testing-debugging-helper`
- For E2E tests (complete user flows) → use the skill `gen-test-e2e`

## Example structure

```js
import { describe, it, expect } from 'vitest'; // omit when globals are enabled
import { myFunction } from '../src/myFile.js';

describe('myFunction', () => {
    it('should return expected value for valid input', () => {
        expect(myFunction('input')).toBe('expected');
    });

    it('should handle edge cases', () => {
        expect(myFunction(null)).toBe(undefined);
    });
});
```

## Validation

After generation, verify that the test file is in the correct folder with the correct name and follows
the project conventions. Run it:

- whole suite: `<run> <scripts.test>`
- one file: `<exec> vitest run <test file>` (Jest: `<exec> jest <test file>`)

Then check coverage with `<run> <scripts.coverage>` when it exists: it fails below the configured thresholds
(`coverage` in the profile, or the runner config). For one file with Vitest:
`<exec> vitest run <test file> --coverage --coverage.include=<source file>`.
