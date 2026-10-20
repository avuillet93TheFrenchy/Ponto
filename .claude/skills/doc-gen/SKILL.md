---
name: doc-gen
description: Use when generating or improving JSDoc or TSDoc documentation for JS/TS functions, classes, or modules.
---

# Documentation Generator (JSDoc / TSDoc)

Generates inline documentation for JavaScript and TypeScript code.

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`) and read its `conventions` files and `notes`. `stack.typescript` and the existing files tell which style applies: TSDoc for `.ts` sources, JSDoc for `.js` (with full types when the project type-checks JS via `checkJs`).

## Workflow

1. Ask which file or function to document (or use the provided argument)
2. Read the target file
3. Identify undocumented or poorly documented exports
4. Generate JSDoc comments following the conventions below
5. Verify no logic is modified — only comments are added

## JSDoc Conventions

### Function

```js
/**
 * Loads the application configuration from disk.
 *
 * @param {string} configPath - Absolute path to the config file
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.strict=false] - Throw on missing keys instead of using defaults
 * @returns {Promise<AppConfig>} Resolved config object
 * @throws {Error} If the file does not exist or is not valid JSON
 *
 * @example
 * const config = await loadConfig('/data/app.json', { strict: true })
 */
export async function loadConfig(configPath, options = {}) { ... }
```

### Class

```js
/**
 * Manages persistent key-value settings for the application.
 * Values are stored via Tauri's invoke API.
 */
export class SettingsStore {
  /**
   * @param {string} namespace - Prefix for all keys (e.g. 'user', 'app')
   */
  constructor(namespace) { ... }

  /**
   * Retrieves a setting value.
   * @param {string} key
   * @returns {Promise<unknown>} The stored value, or `undefined` if not set
   */
  async get(key) { ... }
}
```

### Module (file-level)

```js
/**
 * @module utils/formatters
 * @description Utility functions for formatting dates, numbers, and file sizes
 * for display in the UI.
 */
```

## What to Document

| Priority    | Target                                             |
| ----------- | -------------------------------------------------- |
| Always      | Public exports (functions, classes, constants)     |
| Always      | Parameters that are not self-evident from the name |
| Always      | Functions that throw                               |
| When useful | Non-obvious return types or shapes                 |
| Skip        | Private/internal helpers with obvious names        |
| Skip        | One-liner getters/setters                          |

## TSDoc (TypeScript)

For `.ts`/`.tsx` sources, types live in the signature: the doc comment describes *meaning*, not types
(`@param name - description`, no `{type}`). In a JS project type-checked through JSDoc, use the JSDoc
conventions above with full `{type}` annotations instead — they *are* the types.

```ts
/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param bytes - Size in bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "1.42 MB"
 */
export function formatBytes(bytes: number, decimals = 2): string { ... }
```

## Checklist

- [ ] All public exports have a doc comment
- [ ] `@param` includes description (not just type)
- [ ] `@returns` documents what the value represents
- [ ] `@throws` documented where applicable
- [ ] At least one `@example` for non-trivial functions
- [ ] No logic changed — comments only

## Scope and Cross-References

- For generating tests alongside documentation → `gen-test`
- For generating a full CHANGELOG → `changelog-gen`
