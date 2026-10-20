---
name: changelog-gen
description: Use when generating or updating CHANGELOG.md from git history, following the Conventional Commits format, for a new release of the project.
---

# Changelog Generator

Generates or updates `CHANGELOG.md` from git commit history using Conventional Commits.

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`) and read its `conventions` files and `notes`. Keep the format of an existing `CHANGELOG.md` (Keep a Changelog, release-please...) rather than imposing this one, and use the version from `package.json`.

## Workflow

1. Ask for the version number and release date (or use today's date)
2. Run `git log` to collect commits since the last tag
3. Categorize commits by type
4. Format and prepend the new section to `CHANGELOG.md`
5. Ask whether to create a git tag for the release

## Collect Commits

```bash
# Since the last tag (fails if the repository has no tag yet: then take the whole history)
git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-decorate
git log --oneline --no-decorate   # first release: no tag yet

# Since a specific tag
git log v1.1.0..HEAD --oneline --no-decorate

# Full message (for multi-line commits)
git log v1.1.0..HEAD --pretty=format:"%h %s" --no-decorate
```

## Conventional Commits Categories

| Prefix                                   | Changelog section                   |
| ---------------------------------------- | ----------------------------------- |
| `feat:`                                  | Added                               |
| `fix:`                                   | Fixed                               |
| `perf:`                                  | Performance                         |
| `refactor:`                              | Changed                             |
| `docs:`                                  | Documentation                       |
| `test:`                                  | Tests                               |
| `chore:`, `ci:`, `build:`                | Maintenance                         |
| `BREAKING CHANGE:` or `feat!:` / `fix!:` | **Breaking Changes** (always first) |

> Commits without a recognized prefix go under "Maintenance" unless they look user-facing.

## CHANGELOG.md Format

```markdown
# Changelog

## [1.2.0] - 2025-06-15

### Breaking Changes

- `invoke('load_config')` now returns `null` instead of throwing when file is missing

### Added

- Auto-updater support for Windows and Android (#42)
- Component generator skill

### Fixed

- Path traversal in `read_file` command (#38)
- Toast not dismissed after 5 seconds on mobile

### Performance

- Reduced invoke call count on settings load from 8 to 1

### Maintenance

- Upgraded Tauri to 2.1.0
- Updated cargo dependencies

---

## [1.1.0] - 2025-05-01

...
```

## Handling Ambiguous Commits

| Commit                                       | Action                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| `update styles` (no prefix)                  | Infer from content → "Changed" if code, "Maintenance" if config |
| `wip: progress on feature`                   | Skip (work-in-progress, not release-worthy)                     |
| Merge commits (`Merge pull request...`)      | Skip                                                            |
| Multi-line with `BREAKING CHANGE:` in footer | Include in Breaking Changes section                             |

## Git Tag (optional)

```bash
# After updating CHANGELOG.md
git add CHANGELOG.md
git commit -m "chore: release v1.2.0"
git tag -a v1.2.0 -m "Release v1.2.0"
```

> Ask the user before creating the tag — it may trigger CI/CD pipelines.

## Checklist

- [ ] Commits collected since the correct base tag/commit
- [ ] Breaking changes listed first if any
- [ ] Each entry is user-readable (not "fix typo in variable name")
- [ ] New section prepended (not appended) to CHANGELOG.md
- [ ] Version and date are correct

## Scope and Cross-References

- For building the release after changelog → `build-release`
- For generating doc comments alongside the release → `doc-gen`
