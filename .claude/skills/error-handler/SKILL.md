---
name: error-handler
description: Use when adding or reviewing error handling on async JS/TS code (fetch, promises, event handlers) and, in Tauri apps, IPC invoke calls and Rust command handlers.
---

# Error Handler - Async JS & Tauri IPC

Applies systematic error handling patterns for async JS code and, in Tauri apps, IPC calls.

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`) and read its `conventions` files and `notes`. The `invoke` and `rust` scopes apply only when `stack.tauri`. If the project already has an error convention (wrapper modules, typed `*Error` classes with `cause`, a logger, an error tracker such as Sentry), follow it instead of introducing a new one.

## Workflow

1. Ask for the scope: `async-js`, `invoke` (Tauri), `rust` (Tauri), or `all` (default: `all`)
2. Scan the target file for missing or inconsistent error handling
3. Apply the patterns below
4. Ensure errors are surfaced to the user appropriately (toast, log, or silent retry)

## 1. Tauri invoke Calls (only when `stack.tauri`)

### Pattern: typed error wrapper

```js
// ❌ No error handling
const data = await invoke('load_config');

// ❌ Generic catch — hides the cause
try {
    const data = await invoke('load_config');
} catch (e) {
    console.error(e);
}

// ✅ Typed wrapper with user feedback
import { invoke } from '@tauri-apps/api/core';

async function loadConfig() {
    try {
        return await invoke('load_config');
    } catch (err) {
        const message =
            typeof err === 'string' ? err : (err?.message ?? 'Unknown error');
        showToast(`Failed to load config: ${message}`, 'error');
        return null; // or throw if the caller must handle it
    }
}
```

### When to throw vs return null

| Situation                          | Strategy                                  |
| ---------------------------------- | ----------------------------------------- |
| Critical path (app can't continue) | `throw` — let the top-level handler catch |
| Optional feature (app still works) | Return `null` or default value            |
| User-triggered action              | Show toast, return null                   |
| Background sync                    | Log silently, retry if needed             |

## 2. Async JS Functions

```js
// ❌ Unhandled promise (crashes silently)
loadUserData();

// ❌ Swallowed error
async function loadUserData() {
    try {
        await fetchData();
    } catch {}
}

// ✅ Explicit handling with context
async function loadUserData() {
    try {
        const data = await fetchData();
        return data;
    } catch (err) {
        console.error('[loadUserData] Failed to fetch:', err);
        throw new Error(`loadUserData: ${err.message}`);
    }
}

// ✅ Top-level async entry points always have a global handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('An unexpected error occurred', 'error');
});
```

## 3. Rust Command Handlers (only when `stack.tauri`)

```rust
// ❌ Panics on error — crashes the Tauri backend
#[tauri::command]
pub fn read_file(path: String) -> String {
    std::fs::read_to_string(path).unwrap()
}

// ✅ Returns Result<T, String> — error is serialized to JS
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("read_file({}): {}", path, e))
}
```

### Rust error guidelines

- Return `Result<T, String>` for simple commands
- Return `Result<T, MyError>` (custom enum) for complex modules
- Never use `unwrap()` or `expect()` in `#[tauri::command]` functions
- Include context in error messages (function name + input that caused the error)

## 4. Toast / Notification Patterns

```js
// Suggested centralized error reporter
export function reportError(context, err) {
    const message =
        typeof err === 'string' ? err : (err?.message ?? 'Unknown error');
    console.error(`[${context}]`, err);
    showToast(`${context}: ${message}`, 'error');
}

// Usage
try {
    await invoke('save_settings', { settings });
} catch (err) {
    reportError('Save settings', err);
}
```

## Audit Checklist

- [ ] All `invoke()` calls are inside `try/catch`
- [ ] No empty `catch {}` blocks
- [ ] Rust commands return `Result<T, String>` (no `unwrap`)
- [ ] Top-level unhandled rejection handler present in main JS entry point
- [ ] Errors shown to user when they result from a user action

## Scope and Cross-References

- For Rust input validation → `tauri-security`
- For unit tests covering error paths → `gen-test`
- For performance of error-heavy retry loops → `perf-analyzer`
