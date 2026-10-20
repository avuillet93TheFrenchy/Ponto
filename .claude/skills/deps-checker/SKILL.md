---
name: deps-checker
description: Use when checking for outdated JS (bun, npm, pnpm, yarn) or Rust (cargo) dependencies, available updates, breaking changes, or security vulnerabilities in package.json and Cargo.toml.
---

# Deps Checker

Checks and plans dependency updates for JS/TS (the project's package manager) and Rust (cargo, when present).

## Project context

Resolve the profile first (`.claude/PROJECT-CONTEXT.md`): `packageManager`, `commands.outdated`,
`commands.audit`, `<run>`, `scripts.*`, `stack.rust`, `<tauri>`. Read the `conventions` files and `notes`:
pinned or patched dependencies (`patchedDependencies`, `patches/`, `resolutions`/`overrides`) and packages
that must move together are project-specific.

## Workflow

1. Ask for the scope: `js`, `cargo`, or `all` (default: `all`; `cargo` only when `stack.rust`)
2. Run audit commands for the chosen scope
3. Categorize updates by risk level
4. Present a prioritized update plan

## Check Commands

### JS / TS

```bash
<commands.outdated>                  # outdated dependencies
<commands.audit>                     # known vulnerabilities
<commands.outdated> <package-name>   # one dependency
```

### Cargo (Rust, only when `stack.rust` — run inside the crate folder, e.g. `<tauri>/`)

```bash
cargo outdated --root-deps-only   # requires cargo-outdated (cargo install cargo-outdated)
cargo audit                       # requires cargo-audit (cargo install cargo-audit)
```

> If `cargo-outdated` or `cargo-audit` are not available, notify the user and offer to install them.

## Update Categorization

| Category | Example | Rule | Action |
|---|---|---|---|
| **patch** | `1.2.3 → 1.2.4` | Bug fixes, safe | Update directly |
| **minor** | `1.2.x → 1.3.0` | New features, backwards-compatible | Check changelog, then update |
| **major** | `1.x → 2.0.0` | Possible breaking changes | Read migration guide first |
| **vulnerability** | any version | Regardless of semver | Critical priority, update immediately |

`0.x` packages: treat a minor bump as major.

## Report Format

For each outdated dependency:

```
package-name
  Current  : 1.2.3
  Available: 2.0.0 (MAJOR)
  Severity : possible breaking changes
  Changelog: [link if found via npm/crates.io]
  Action   : Read the CHANGELOG before updating
```

## Update Plan

Present in this order:
1. **Critical**: known vulnerabilities (all versions)
2. **Patch**: minor updates with no risk
3. **Minor**: new features with backwards compatibility
4. **Major**: breaking changes to plan carefully

## Update Commands

| Package manager | One package | All within semver ranges | Latest (major) |
|---|---|---|---|
| bun | `bun update <pkg>` | `bun update` | `bun update <pkg> --latest` |
| npm | `npm update <pkg>` | `npm update` | `npm install <pkg>@latest` |
| pnpm | `pnpm update <pkg>` | `pnpm update` | `pnpm update <pkg> --latest` |
| yarn | `yarn up <pkg>` | `yarn up '*'` | `yarn up <pkg>@latest` |
| cargo | `cargo update -p <crate>` | `cargo update` | edit `Cargo.toml`, then `cargo update` |

## Post-Update Validation

After each update, run what exists (skip `null` scripts):

```bash
<run> <scripts.typecheck> && <run> <scripts.lint> && <run> <scripts.coverage or scripts.test>
cargo build            # when stack.rust, inside the crate folder
<run> <scripts.e2e>    # critical flows still work
```

General rules:

- Commit the lockfiles (`bun.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `Cargo.lock`) with
  the update: a version yanked later stays installable from a lockfile, not from a fresh resolution.
- A patched dependency (`patchedDependencies`, `patch-package`) needs its patch re-checked on every version
  change — or dropped if the upstream fix landed.
- Tauri: `@tauri-apps/*` (npm) and `tauri-*` (crates) go together — keep a plugin's JS package and Rust
  crate on the same minor version.

## Scope and Cross-References

- For an in-depth security audit of dependencies → `security-reviewer`
- For a release build after updating → skill `build-release`
