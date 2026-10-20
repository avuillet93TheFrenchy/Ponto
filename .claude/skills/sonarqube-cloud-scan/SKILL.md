---
name: sonarqube-cloud-scan
description: Run a SonarQube Cloud (formerly SonarCloud) analysis on the project and review reported bugs, vulnerabilities, hotspots, and code smells. Use when the user mentions "sonar", "sonarqube", "sonarcloud", "sonarqube cloud", "code quality scan", "qualité du code", "analyser avec sonar", "lancer sonar", or before merging to main. Works for any JS/TS web project (Vite, frameworks, Tauri v2).
---

# SonarQube Cloud Scan

Resolve the project profile first (`.claude/PROJECT-CONTEXT.md`): `<exec>`, `<run>`, `scripts.coverage`, `paths`, `coverage.exclude`, `stack.tauri`, `name`.

Run SonarQube Cloud analysis using the `@sonar/scan` Node.js scanner (no Java runtime required) or the `sonar-scanner` CLI, then summarize results.

Sources used in this skill:

- [SonarQube Cloud npm scanner](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/ci-based-analysis/sonarscanner-npm/)
- [SonarScanner CLI reference](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner/)
- [SonarQube CLI (sonar)](https://docs.sonarsource.com/sonarqube-cli/)

## Prerequisites

1. SonarQube Cloud account at https://sonarcloud.io with an organization and project created
2. A user token: My Account → Security → Generate Token
3. The token exported as `SONAR_TOKEN` in the current shell

Check that the token is set without printing it in full:

```bash
# Unix / macOS / WSL
[ -n "$SONAR_TOKEN" ] && echo "SONAR_TOKEN set (${#SONAR_TOKEN} chars)" || echo "SONAR_TOKEN NOT set"
```

```powershell
# Windows PowerShell
if ($env:SONAR_TOKEN) { "SONAR_TOKEN set ($($env:SONAR_TOKEN.Length) chars)" } else { "SONAR_TOKEN NOT set" }
```

Never echo the full token; never write it to disk. If missing, ask the user to create one and export it; do not invent a value.

## Configuration

The scanner reads `sonar-project.properties` at the repo root. Check with `ls sonar-project.properties`
first. If it is missing, propose a file built from the profile and create it only once the user confirms
it — **ask for the project key and organization** (SonarQube Cloud → project → Information), never invent them:

```properties
sonar.projectKey=<organization>_<repo>
sonar.organization=<organization>
sonar.projectName=<project>
sonar.projectVersion=<package.json version>
sonar.sourceEncoding=UTF-8

# <src> plus any other first-party code (scripts/, website/, root HTML)
sonar.sources=<src>
sonar.tests=<tests>
sonar.test.inclusions=**/*.test.*,**/*.spec.*
sonar.exclusions=node_modules/**,coverage/**,dist/**,build/**,<tauri>/**,**/*.config.*

# Same exclusions as the unit coverage config (coverage.exclude of the profile)
sonar.coverage.exclusions=<coverage.exclude, comma-separated>
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

For co-located tests (`<src>/**/*.test.*`), keep `sonar.tests=<src>` and add
`sonar.test.inclusions` plus the same patterns in `sonar.exclusions`, or the files count twice.

Keep `sonar.projectVersion` equal to `package.json`'s version (see `build-release`, "Version bump").
`coverage/lcov.info` exists only after `<run> <scripts.coverage>` (with the `lcov` reporter enabled): run
it before the scan, or the coverage shows 0 %.

Tauri/Rust (`<tauri>/**`) stays excluded: Rust analysis on SonarQube Cloud requires a community plugin or a
clippy-to-Sonar bridge — don't add `<tauri>/src` to `sonar.sources` without checking that support exists
(`rust-reviewer` and `cargo clippy` cover the Rust code).

Rules the project deliberately ignores (legacy code, gameplay `Math.random()`...) go in
`sonar.issue.ignore.multicriteria` with a comment explaining why; legacy areas listed in `notes` are
reported separately from the modern code.

## Run the scan

Preferred (no Java):

```bash
npx @sonar/scan      # or bunx / pnpm dlx / yarn dlx, matching the project's package manager
```

The scanner reads `sonar-project.properties` and `SONAR_TOKEN` from the environment. Source: [@sonar/scan package on the npm registry](https://www.npmjs.com/package/@sonar/scan). `pnpm exec` / `yarn exec` only run installed binaries: use `pnpm dlx` / `yarn dlx` for this one-off run.

Alternative, standalone CLI:

```bash
sonar-scanner -Dsonar.token=$SONAR_TOKEN
```

## Inspect results

The scanner prints the dashboard URL on success:

```
ANALYSIS SUCCESSFUL, you can find the results at: https://sonarcloud.io/dashboard?id=<projectKey>
```

To list issues from the terminal, install the SonarQube CLI (the developer CLI, distinct from `sonar-scanner`):

```bash
sonar issues list --project <projectKey>
```

Reference: [SonarQube CLI overview](https://docs.sonarsource.com/sonarqube-cli/).

## Pre-flight check on local changes

Per the SonarQube CLI docs, `sonar verify` runs the analyses the CLI supports on uncommitted work:

```bash
sonar verify
```

## Triage order

1. **Bugs** (reliability) — may break functionality
2. **Vulnerabilities** + **Security Hotspots** — hotspots require manual review
3. **Code Smells** — fix opportunistically

## Report back to the user

After analysis completes, summarize:

- Quality Gate: PASSED / FAILED (state explicitly which conditions failed if known)
- New issues by type: bugs / vulnerabilities / hotspots / code smells
- Coverage delta if available
- Top 3 issues: file:line, rule id, one-sentence fix
- Dashboard URL

If SonarQube Cloud is not yet configured for the project, do not invent values — guide the user through the setup at https://sonarcloud.io and stop.
