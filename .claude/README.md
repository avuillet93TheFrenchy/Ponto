# Boîte à outils Claude Code multi-projets

Agents, skills et hooks pour projets **JS/web** : vanilla ou framework (React, Vue, Svelte…), JS ou
TypeScript, avec ou sans Vite, Tauri v2 et Rust, et avec bun, npm, pnpm ou yarn. Rien n'est propre à un
projet : ce qui change d'un projet à l'autre vient d'un **profil**.

## Installation dans un projet

1. Copier le dossier `.claude/` à la racine du projet (sans `settings.local.json`, qui est personnel).
2. Vérifier ce qui est détecté :

   ```bash
   bash .claude/hooks/run-node.sh project-context.js
   ```

3. Si besoin, créer `.claude/project.json` pour corriger ou compléter la détection. Tous les champs sont
   optionnels, et le schéma `project.schema.json` donne l'autocomplétion dans l'éditeur :

   ```json
   {
       "$schema": "./project.schema.json",
       "name": "MonApp",
       "coverage": { "statements": 90, "branches": 85, "functions": 90, "lines": 90 },
       "protectedPaths": ["src/vendor/**", "!dist/**"],
       "lint": { "exclude": ["src/legacy/**"] },
       "conventions": ["docs/conventions.md"],
       "notes": ["Les textes visibles passent par t() avec une clé dans chaque fichier de src/locales/."]
   }
   ```

## Ce qui est détecté automatiquement

| Élément | Source |
| --- | --- |
| Package manager | champ `packageManager` de `package.json`, puis le lockfile (`bun.lock`, `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`) |
| Scripts | noms usuels dans `package.json` (`test`, `test:coverage`, `test:e2e`, `lint`, `typecheck`…) |
| Stack | dépendances (vite, vitest, jest, playwright, eslint, biome, sass, tailwind, frameworks…), `tsconfig.json`, `src-tauri/`, `Cargo.toml`, `REUSE.toml`, `sonar-project.properties` |
| Dossiers | `src`, `__tests__` / `tests` / `test`, `<tests>/e2e`, `src/scss` / `src/styles` / `src/css`, `src-tauri` |
| Conventions | `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md` s'ils existent |

## Hooks

- **`pre-edit-guard.js`** (PreToolUse) : bloque l'écriture sur les chemins protégés (lockfiles, `dist/**`,
  keystores, fichiers Tauri générés, plus les `protectedPaths` du profil ; `.env*` et `node_modules`
  toujours). Un motif préfixé par `!` retire une protection par défaut.
- **`post-lint.js`** (PostToolUse) : lance eslint, biome, stylelint ou htmlhint sur le fichier modifié,
  selon l'extension (`lint.linters`), sauf les chemins de `lint.exclude`. Un linter absent ne bloque jamais.
- **`run-node.sh`** : trouve Node même hors du PATH (fnm, nvm, volta), sinon utilise Bun. C'est lui que
  `settings.json` appelle.

Les globs suivent la logique de `.gitignore` : ils sont ancrés à la racine, `**` couvre plusieurs niveaux,
et `dir/**` vise le contenu du dossier mais pas le dossier lui-même.

## Agents et skills

Chacun commence par lire le profil (voir `PROJECT-CONTEXT.md`) : nom du projet, commandes, dossiers, stack,
fichiers de conventions. Les parties Tauri et Rust sont ignorées quand le projet n'en utilise pas.

## Exemple : HatMP

`examples/hatmp/` contient le profil et les conventions du projet d'origine, c'est-à-dire tout ce qui
était codé en dur auparavant. Pour l'appliquer à HatMP :

```bash
cp .claude/examples/hatmp/project.json .claude/project.json
```
