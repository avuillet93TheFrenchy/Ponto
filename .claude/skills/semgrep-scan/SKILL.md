---
name: semgrep-scan
description: Run Semgrep static analysis on the project to find security vulnerabilities and code-quality issues in JavaScript/TypeScript and, for Tauri apps, Rust. Use proactively whenever the user mentions "semgrep", "SAST", "security scan", "find vulnerabilities", "audit code", "scan code", "vérifier la sécurité", "analyser la sécurité", or after meaningful changes to Tauri commands or to JS code that handles user input, deep links, or `invoke()` calls.
---

# Semgrep Scan

Run Semgrep on the project, surface findings ordered by severity, and propose concrete fixes. Works for any JS/TS web project; the Rust/Tauri rules apply when the project uses Tauri.

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`): scan `<src>` (and `<tauri>/src` when `stack.tauri`), skip build output and the paths the `notes` declare as vendored or legacy.

## When to use

- The user asks to scan, audit security, or run SAST
- After modifying Tauri commands in `<tauri>/src/`
- After adding or changing JS that touches `invoke()`, untrusted input, deep links, or DOM manipulation
- Before tagging a release

## Prerequisites

Verify Semgrep is installed:

```bash
semgrep --version
```

If missing, install per the official guide ([Semgrep installation](https://semgrep.dev/docs/getting-started/quickstart)). On Windows + WSL or Python: `python -m pip install semgrep`.

## Run a scan

### Default (community rules, no login required)

```bash
semgrep scan --config "auto"
```

`--config auto` picks rulesets based on detected languages. Source: [Semgrep CLI reference](https://semgrep.dev/docs/cli-reference).

### Targeted scans

Frontend only:

```bash
semgrep scan --config "p/javascript" --config "p/owasp-top-ten" src/
```

Rust backend only:

```bash
semgrep scan --config "p/rust" src-tauri/src/
```

### CI-grade scan

`semgrep ci` uses your AppSec Platform policies (if logged in) and returns non-zero on findings. Per the [Semgrep CI vs CLI doc](https://semgrep.dev/docs/kb/semgrep-ci/ci-vs-cli):

```bash
semgrep ci
```

### Machine-readable output

```bash
semgrep scan --config auto --json --output semgrep-results.json
semgrep scan --config auto --sarif --output semgrep-results.sarif
```

## Triage order

1. ERROR severity in `src-tauri/` Rust files (potentially exploitable)
2. ERROR severity in JS code touching `invoke()`, `@tauri-apps/api`, or user input
3. WARNING severity, any path
4. INFO — review only if time permits

## Tauri-specific issues to watch for

Even without custom rules, scan output should be reviewed for these patterns:

- Tauri commands accepting unvalidated `String` params then calling `std::process::Command` or shell exec
- Capability files (`src-tauri/capabilities/*.json`) granting broad permissions like `shell:allow-execute` without argument constraints
- `dangerousDisableAssetCspModification` set to `true` in `tauri.conf.json`
- `invoke()` calls in JS using untrusted input as the command name
- SQL injection in Rust commands using `format!()` for queries

For project-specific patterns, create custom rules under `.semgrep/`. Reference: [Semgrep rule syntax](https://semgrep.dev/docs/writing-rules/rule-syntax).

## Suppress findings

Inline (single line):

```javascript
// nosemgrep: rule-id-here
const x = unsafeButReviewed();
```

Globally: add patterns to `.semgrepignore` (gitignore-style). Reference: [Ignoring files](https://semgrep.dev/docs/ignoring-files-folders-code).

## Report back to the user

After running, present:

1. **Summary**: `N errors, M warnings, K info across F files`
2. **Top issues** (max 5) grouped by file, each with: `path:line`, severity, rule id, one-sentence fix
3. **Next action** (e.g., "Fix the SQL injection at `src-tauri/src/db.rs:42`, then rerun `semgrep scan --config auto`")

If no findings: state clearly `Semgrep found no issues with the auto config.` Do not invent findings.
