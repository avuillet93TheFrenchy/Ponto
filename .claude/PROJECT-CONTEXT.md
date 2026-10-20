# Project context — shared by every agent and skill of this toolkit

The agents, skills and hooks of `.claude/` are project-agnostic: they work on any JS/web project
(vanilla JS or a framework, JS or TypeScript, with or without Vite, Tauri v2, Rust; bun, npm, pnpm or
yarn). Everything specific to one project comes from its **profile**.

## 1. Resolve the profile first

Run, from the project root:

```bash
bash .claude/hooks/run-node.sh project-context.js   # finds node (PATH, fnm, nvm, volta) or bun
```

It prints `.claude/project.json` (optional, schema in `.claude/project.schema.json`) merged with what is
detected from the repository. If the command cannot run, read `.claude/project.json` and `package.json`
yourself and apply the same rules (lockfile → package manager, `src-tauri/` → Tauri...).

| Field | Use it for |
| --- | --- |
| `name`, `description` | The project name in reports and headers — never hard-code another project's name |
| `commands.run` / `commands.exec` | `<run>` and `<exec>` below, e.g. `bun run` / `bunx`, `npm run` / `npx`, `pnpm run` / `pnpm exec` |
| `commands.install`, `installFrozen`, `add`, `audit`, `outdated` | Dependency commands of the package manager |
| `scripts.<task>` | The real package.json script name of `test`, `coverage`, `e2e`, `lint`, `typecheck`, `build`, `dev`; `null` = the project has none: say so, do not invent one |
| `stack.*` | Which sections apply: Tauri/Rust checks only when `stack.tauri` / `stack.rust`, Vitest vs Jest, TypeScript vs JSDoc, frameworks... |
| `paths.*` | Source, tests, E2E, styles and Tauri folders — never assume `src/js` or `__tests__` |
| `coverage` | Thresholds to report against (when `null`, read them from the test runner config if any) |
| `bundleBudget` | Bundle size gate (default below) |
| `protectedPaths`, `lint.exclude` | What the hooks protect / do not lint: do not try to edit protected files |
| `conventions` | Files to **read before reviewing or generating code** (CLAUDE.md, AGENTS.md, CONTRIBUTING.md, extra docs) |
| `notes` | Project-specific rules that override the generic guidance of a skill |

## 2. Notation used in agents and skills

- `<run> <script>` — run a package.json script with the project's package manager (`<run> test`).
  Use the name from `scripts.<task>`: `<run> <coverage>` means `bun run test:coverage` if that is the script.
- `<exec> <bin>` — run a binary from the dependencies (`<exec> vitest run`, `<exec> playwright test`).
  For a one-off package that is not installed, use `npx` / `bunx` / `pnpm dlx` / `yarn dlx`.
- `<pm>` — the package manager itself (`packageManager`: `bun`, `npm`, `pnpm`, `yarn`).
- `<commands.add>`, `<commands.audit>`... — the matching entry of `commands`.
- `<scripts.e2e>`... — the matching entry of `scripts` (a script name, to run with `<run>`).
- `<src>`, `<tests>`, `<e2e>`, `<styles>`, `<tauri>` — the folders of `paths`.
- `<project>` — `name`.

## 3. Precedence

1. The user's request
2. The project's convention files and `notes`
3. The generic guidance of the agent/skill

When the project's own tooling config (eslint, stylelint, tsconfig, vitest/jest, playwright, Vite,
`tauri.conf.json`) disagrees with an example in a skill, **the config wins**: read it instead of
assuming a default.

## 4. Defaults when the profile says nothing

| Topic | Default |
| --- | --- |
| Bundle budget (gzip) | initial JS warn 200 KB / block 400 KB · vendor 150 / 300 · total initial load 500 / 1000 |
| Unit test layout | mirror the source tree under `<tests>`, or co-located `*.test.*` files if the project already does that |
| Test language | the one of the source file (TS source → TS test) |
| Licensing checks | only when `stack.reuse` (REUSE.toml) or the conventions mention SPDX headers |
| Sections for Tauri / Rust / Android | skip entirely when `stack.tauri` / `stack.rust` is false, and say so in one line |
