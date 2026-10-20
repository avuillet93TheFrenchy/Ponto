---
name: tauri-capability-audit
description: Use when auditing Tauri v2 capabilities — verifies that permissions in capabilities/*.json match the plugins actually used in Cargo.toml and JS imports, flags over-permissioned or missing capabilities.
---

# Tauri Capability Audit

Audits Tauri v2 capability files to ensure permissions match actual plugin usage — no more, no less.

## Workflow

1. Inventory all Tauri plugins from `Cargo.toml` and `package.json`, and where `<tauri>/src/lib.rs`
   registers them
2. Read all capability files in `<tauri>/capabilities/`
3. Cross-reference: permissions granted vs plugins used, per platform
4. Report over-permissions and missing permissions

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`): `<tauri>` is the Tauri folder, `<src>` the
frontend. If `stack.tauri` is false, stop. Read the `conventions` files and `notes`: they may document local
plugins, platform-specific capability files and the scopes the app legitimately needs.

Things to keep in mind in any project:

- **Local plugins** (`path` dependencies in `Cargo.toml`, e.g. `<tauri>/plugins/tauri-plugin-x/`) have no
  `@tauri-apps/plugin-*` package: their JS side calls `invoke('plugin:<name>|<command>')`, and their
  permissions are defined in the plugin's own `permissions/` folder.
- **Community plugins** may ship their JS API under another npm name (e.g. `tauri-plugin-sentry-api`).
- **Several capability files** can target different platforms (`"platforms": ["windows", "linux"]`...).
- Plugins registered on desktop only (`#[cfg(desktop)]`, `cfg(not(target_os = "android"))`): a permission
  for them in a capability that includes mobile grants nothing there — report it as LOW, not as a missing plugin.
- Plugins without commands (e.g. `single-instance`) need no permission.

## 1. Installed Plugins

### Rust side (Cargo.toml)

```bash
grep 'tauri-plugin-' <tauri>/Cargo.toml
```

### JS side (package.json)

```bash
grep '@tauri-apps/plugin-' package.json
```

### Registration (lib.rs)

```bash
grep -n "plugin(" <tauri>/src/lib.rs
```

A plugin in `Cargo.toml` but never registered with `.plugin(...)` makes every call fail at runtime; a
`.plugin(tauri_plugin_x::...)` without its crate in `Cargo.toml` fails the build — Check both ways.

Build a list of all active plugins (e.g., `fs`, `dialog`, `store`, `log`, `notification`, etc.).

## 2. Granted Capabilities

Read all JSON files in `<tauri>/capabilities/`:

```bash
ls <tauri>/capabilities/*.json
```

For each file, extract the `permissions` array. Each permission follows the pattern:

- `<plugin>:default` — all default permissions for that plugin
- `<plugin>:allow-<action>` — specific action permission
- `<plugin>:deny-<action>` — explicit deny
- `core:default` — Tauri core permissions

## 3. Cross-Reference

### Over-permissioned (granted but plugin not installed)

A permission for a plugin that is not in `Cargo.toml` or `package.json`:

```
[HIGH] Over-permission: capability grants permissions for uninstalled plugin
  Capability : <tauri>/capabilities/default.json
  Permission : shell:allow-execute
  Plugin     : tauri-plugin-shell — NOT in Cargo.toml
  Risk       : Unnecessary attack surface if plugin is added later
  Fix        : Remove the permission entry
```

### Missing permissions (plugin installed but no capability)

A plugin in `Cargo.toml`/`package.json` with no matching permission in any capability file:

```
[MEDIUM] Missing capability: installed plugin has no permissions granted
  Plugin     : tauri-plugin-notification
  Cargo.toml : present
  Capability : no matching permission in any capabilities/*.json
  Impact     : Plugin calls will fail at runtime
  Fix        : Add "notification:default" to the appropriate capability file
```

### Overly broad permissions

Flag `<plugin>:default` when only specific actions are used in the JS code:

```bash
# Check which plugin APIs are actually called
grep -rn "import.*from.*@tauri-apps/plugin-fs" <src>/ --include="*.js" --include="*.ts"
grep -rn "readFile\|writeFile\|readDir\|mkdir\|remove\|rename\|exists" <src>/ --include="*.js" --include="*.ts"
```

```
[LOW] Broad permission: using default but only specific actions needed
  Plugin     : fs
  Granted    : fs:default (all fs operations)
  Used       : readFile, writeFile, exists
  Suggestion : Replace with fs:allow-read, fs:allow-write, fs:allow-exists
```

## 4. Scope Validation

For plugins that support scoped access (especially `fs`), verify scopes are restrictive:

```
[HIGH] Unrestricted filesystem scope
  Capability : default.json
  Current    : fs:scope — no path restrictions
  Fix        : Limit the scope to the folders the app needs
```

Compare every scope with what the app actually needs (read the code paths that use it) and with the
needs documented in the conventions; report anything wider. Typical tight scopes:

- `fs`: a base directory variable (`$APPLOCALDATA/**`, `$APPDATA/<app>/**`) rather than `$HOME/**` or `**`
- `http`: the exact HTTPS origins the app calls — they must also be allowed by the CSP's `connect-src`
- `shell`/`opener`: explicit programs or URL patterns

## Report Format

```
=== Tauri Capability Audit ===

Plugins installed  : N (Cargo.toml + package.json)
Capability files   : N
Permissions granted: N total

[HIGH]   Over-permissions    : N
[MEDIUM] Missing permissions : N
[LOW]    Broad permissions   : N
[HIGH]   Scope issues        : N

RESULT: CLEAN / N issues found
```

## Scope and Cross-References

- For full security audit → `tauri-security` skill or `security-reviewer` skill
- For dependency audit → `deps-checker` skill
- For build validation → `build-validator` agent
