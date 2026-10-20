---
name: tauri-security
description: Audit and harden the security of a Tauri v2 application — CSP configuration, capability files (permissions/ACL), IPC command input validation, dangerous Tauri settings, and the JS-side `invoke()` surface. Use when the user mentions "tauri security", "audit tauri", "sécurité tauri", "configurer les permissions", "CSP tauri", "harden tauri", or whenever a new Tauri command, permission, or window is added.
---

# Tauri Security Auditor (v2)

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`): `<tauri>` is the Tauri folder (usually `src-tauri`). If `stack.tauri` is false, stop: this skill is Tauri-only. Read the `conventions` files for the scopes the app legitimately needs.

Audits and hardens the security of a Tauri v2 application. Replaces the v1-era `tauri-security` skill: the `allowlist` system has been removed in v2 and replaced by capabilities and permissions ([Tauri 2.0 release notes](https://v2.tauri.app/blog/tauri-20/), [Migrate from v1](https://v2.tauri.app/start/migrate/from-tauri-1/)).

Reference docs:

- [Tauri v2 — Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tauri v2 — Permissions](https://v2.tauri.app/security/permissions/)
- [Tauri v2 — Capability reference (ACL)](https://v2.tauri.app/reference/acl/capability/)
- [Tauri v2 — Configuration reference](https://v2.tauri.app/reference/config/)
- [Tauri v2 — File System plugin](https://v2.tauri.app/plugin/file-system/)

## Workflow

1. Ask for the scope: `csp`, `capabilities`, `ipc`, `dangerous-flags`, `tooling`, or `all` (default: `all`)
2. For `tooling`, defer to the `semgrep-scan` and `sonarqube-cloud-scan` skills (or the `security-auditor` subagent for parallel execution)
3. Analyze the chosen scope
4. Report issues by severity (critical / high / medium / low)
5. Suggest concrete fixes referencing v2 syntax

---

## 1. CSP (Content Security Policy)

### Where to check (v2)

`<tauri>/tauri.conf.json` → `app.security.csp` and `app.security.devCsp`

The root key is `app`, not `tauri` (which was v1). Reference: [Tauri v2 config — security](https://v2.tauri.app/reference/config/).

### Audit

| Issue                                        | Risk                                           | Fix                                |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| `csp: null` in production                    | Critical — no protection                       | Set a strict CSP                   |
| `script-src 'unsafe-inline'`                 | High — XSS via injected scripts                | Remove, use nonces or hashes       |
| `script-src 'unsafe-eval'`                   | High — enables `eval()`-based attacks          | Remove unless absolutely required  |
| `default-src *` or `connect-src *`           | Critical — wildcard allows everything          | Replace with explicit origins      |
| `dangerousDisableAssetCspModification: true` | Critical — Tauri stops injecting its asset CSP | Remove unless explicitly justified |
| `devCsp` contains unsafe directives          | Medium — flag even in dev                      | Tighten or accept with a rationale |

### Secure CSP example (v2)

```json
{
    "app": {
        "security": {
            "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset: https://asset.localhost; connect-src 'self' ipc: http://ipc.localhost",
            "devCsp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ipc: http://ipc.localhost ws://localhost:1421"
        }
    }
}
```

`asset:` and `http://ipc.localhost` are Tauri-specific protocols. `ws://localhost:1421` covers Vite HMR (only in dev).

---

## 2. Capabilities (replaces v1 allowlist)

### Where to check

`<tauri>/capabilities/*.json` or `*.toml`. Each file is a capability that grants permissions to specified windows/webviews. Reference: [Tauri v2 — Capabilities](https://v2.tauri.app/security/capabilities/).

### Minimal valid capability

```json
{
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "main-capability",
    "description": "Capability for the main window",
    "windows": ["main"],
    "permissions": ["core:default"]
}
```

Required: `identifier`, `windows` (or `webviews`), `permissions`. Optional: `$schema`, `description`, `platforms`, `local`, `remote`.

### Permission syntax

`${plugin-name}:${permission-name}` — examples (verify against `<tauri>/gen/schemas/desktop-schema.json` for your installed plugin versions):

- `core:default`, `fs:default`, `dialog:default`
- `fs:allow-read-text-file`, `fs:allow-write-text-file`
- `dialog:allow-open`, `dialog:allow-save`
- `shell:default`, `shell:allow-execute`
- `http:default`, `notification:default`

For commands defined directly in your `<tauri>` crate, only `${permission-name}` is required (no plugin prefix). Tauri auto-generates `allow-<cmd>` and `deny-<cmd>` per command in the build script's `COMMANDS` const.

### Scoped permissions (narrow what's allowed)

```json
{
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "main-capability",
    "windows": ["main"],
    "permissions": [
        "core:default",
        {
            "identifier": "fs:allow-write-text-file",
            "allow": [{ "path": "$APPDATA/*" }]
        },
        {
            "identifier": "fs:scope",
            "allow": [{ "path": "$APPDATA" }, { "path": "$APPDATA/**/*" }]
        }
    ]
}
```

Path variables (from the [File System plugin docs](https://v2.tauri.app/plugin/file-system/)): `$APPDATA`, `$APPCONFIG`, `$APPCACHE`, `$APPLOCALDATA`, `$AUDIO`, `$CACHE`, `$CONFIG`, `$DATA`, `$DESKTOP`, `$DOCUMENT`, `$DOWNLOAD`, `$EXE`, `$FONT`, `$HOME`, `$LOCALDATA`, `$LOG`, `$PICTURE`, `$PUBLIC`, `$RESOURCE`, `$RUNTIME`, `$TEMP`, `$TEMPLATE`, `$VIDEO`. `deny` rules always take precedence over `allow`.

### Audit checklist

- [ ] Each capability has a unique `identifier`
- [ ] `windows` field matches actual window labels declared in `tauri.conf.json` or via `WebviewWindowBuilder`
- [ ] No `shell:allow-execute` without scoped `allow` constraints on which programs can run
- [ ] No `fs:allow-write-*` covering `$HOME/**` or `**`
- [ ] No `http:default` or `http:allow-*` with broad `urls` scope
- [ ] No `core:default` paired with broad plugin-default permissions you don't need
- [ ] Custom command permissions (`allow-<command>`) match real commands — flag dangling permissions for deleted commands
- [ ] Capabilities target window labels that actually exist
- [ ] Separate capability files per privilege tier (e.g. main window vs settings window)

---

## 3. IPC Command Audit (Rust side)

### Dangerous patterns in Tauri commands

```rust
// ❌ Unvalidated path + panic on failure
#[tauri::command]
pub fn read_file(path: String) -> String {
    std::fs::read_to_string(path).unwrap() // path traversal + panic in release
}

// ✅ Validated path + serializable error
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let base = std::path::Path::new("/expected/base/dir");
    let safe_path = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| e.to_string())?;

    // Ensure path stays within the allowed base directory
    if !safe_path.starts_with(base) {
        return Err("Path traversal not allowed".into());
    }

    std::fs::read_to_string(safe_path).map_err(|e| e.to_string())
}
```

### Checklist

- [ ] No `unwrap()` / `expect()` in command handlers (use `?` or `map_err`)
- [ ] All string inputs validated before use as paths, shell args, or SQL fragments
- [ ] Return types are `Result<T, E>` where both `T` and `E` implement `serde::Serialize` (not `Box<dyn Error>`)
- [ ] No `panic!` reachable from a command — Tauri does not catch panics gracefully in release mode
- [ ] No sensitive data (passwords, tokens, full paths revealing system structure) in error messages
- [ ] Every `#[tauri::command]` function is registered in `tauri::generate_handler![...]`
- [ ] A corresponding permission exists in a capability file (commands without permissions are unreachable from the frontend)

For deeper Rust quality review (memory, async/tokio, conventions), delegate to `rust-reviewer`. For Tauri-specific command machinery, delegate to the `tauri-v2-reviewer` subagent.

---

## 4. Dangerous flags and remote IPC

### `dangerousDisableAssetCspModification`

```json
// ❌ Production: Tauri's asset CSP injection is disabled
{
    "app": {
        "security": {
            "dangerousDisableAssetCspModification": true
        }
    }
}
```

Per the [Tauri v2 config reference](https://v2.tauri.app/reference/config/), this disables Tauri's automatic CSP injection for assets. Remove unless you understand and accept the implication.

### Remote IPC (replaces v1's `dangerousRemoteDomainIpcAccess`)

In v2, remote-origin access to Tauri commands is configured per-capability via `remote.urls`:

```json
// Capability allowing a specific remote origin to use a subset of permissions
{
    "$schema": "../gen/schemas/desktop-schema.json",
    "identifier": "remote-capability",
    "windows": ["main"],
    "remote": {
        "urls": ["https://api.example.com"]
    },
    "permissions": ["fs:allow-read-text-file"]
}
```

Reference: [Tauri v2 — Capabilities, remote access](https://v2.tauri.app/security/capabilities/).

### Audit checklist

- [ ] `dangerousDisableAssetCspModification` not set, or set to `false`
- [ ] `remote.urls`, if present in any capability, is HTTPS-only and contains no host wildcards (e.g. `https://*` is bad; `https://api.example.com` is fine)
- [ ] `remote.urls` grants only the minimum permissions actually needed — not `core:default` or broad plugin defaults
- [ ] On Linux/Android, treat remote IPC with extra suspicion: Tauri cannot distinguish embedded `<iframe>` from the main window (per [Capabilities doc](https://v2.tauri.app/security/capabilities/))

---

## 5. Tooling (delegate)

For automated scanning, defer to specialized skills rather than re-implementing checks here:

| Tool                         | When                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `semgrep-scan` skill         | Pattern-based SAST on JS + Rust, fast, runs locally                                                   |
| `sonarqube-cloud-scan` skill | Broader quality + security with cross-file analysis, cloud-hosted                                     |
| `security-auditor` subagent  | Runs both in parallel, returns consolidated report (use when output would clog the main conversation) |
| `deps-checker` skill         | Dependency vulnerabilities only                                                                       |

---

## Report Format

```
[CRITICAL/HIGH/MEDIUM/LOW] Issue title
  File   : <tauri>/capabilities/default.json:14
  Source : [manual] | [semgrep:rule-id] | [sonar:rule-id]
  Detail : description of the problem
  Fix    : corrected configuration or code snippet
```

The `Source` field makes it explicit whether the issue came from manual review or a tool — useful for triage.

---

## Scope and Cross-References

- For Rust quality issues (unwrap, async, conventions) → `rust-reviewer`
- For Tauri-specific command machinery review → `tauri-v2-reviewer` (subagent)
- For frontend code conventions → `code-reviewer`
- For IPC error handling patterns → `error-handler`
- For dependency vulnerabilities → `deps-checker`
- For a final build after hardening → `build-release`

## When to invoke — Examples

| Situation                                 | Example prompt                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Before a release build                    | "Do a full security audit before the release build"                                  |
| New Tauri command added                   | "I added a `read_config` command — check capabilities and validation"                 |
| CSP modified                              | "Review the updated CSP in `tauri.conf.json` for unsafe directives"                   |
| New capability file                       | "Audit `<tauri>/capabilities/admin.json` for over-permissive grants"                |
| Front shows `not allowed to call command` | "Help me figure out which permission `read_config` needs"                             |
| Remote API needs access                   | "I need to let `https://api.example.com` call a Tauri command — what's the safe way?" |
