/**
 * Lints one edited file with the linter matching its extension. Shared by the
 * post-edit hooks (other agents' hooks, such as .codex/hooks or .vibe/hooks,
 * can import this file too).
 *
 * The extension → linter map and the excluded paths come from the project
 * profile (`lint` in `.claude/project.json`, on top of the defaults of
 * ./project-config.js): eslint, stylelint, htmlhint or biome.
 *
 * Linters are resolved from the project root (not the current working
 * directory, which the agent may have moved into a sub-folder) and run from it
 * so the root configs (eslint.config.js, stylelint.config.mjs, .htmlhintrc...) apply.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { matchAny } from './glob.js';
import { LINTER_COMMANDS, loadProjectConfig } from './project-config.js';

/**
 * Lint errors of `filePath` (absolute), or null when it is clean or not lintable.
 * @param {string} filePath
 * @param {string} projectRoot
 * @returns {string | null}
 */
export function lintFile(filePath, projectRoot) {
    if (!existsSync(filePath)) return null;

    // Only lint files that belong to the project, never dependencies, build output
    // or the paths the project excludes from linting.
    const relative = path.relative(projectRoot, filePath).replaceAll('\\', '/');
    if (
        relative.startsWith('../') ||
        path.isAbsolute(relative) ||
        relative.split('/').includes('node_modules')
    ) {
        return null;
    }

    const { lint } = loadProjectConfig(projectRoot);
    if (matchAny(lint.exclude, relative)) return null;

    const linterName = lint.linters[path.extname(filePath).toLowerCase()];
    const linter = linterName
        ? LINTER_COMMANDS[/** @type {keyof typeof LINTER_COMMANDS} */ (linterName)]
        : undefined;
    if (!linter) return null;

    // A missing linter (not a dependency, or dependencies not installed) must not block edits.
    const linterPath = path.join(projectRoot, linter.bin);
    if (!existsSync(linterPath)) return null;

    const result = spawnSync(process.execPath, [linterPath, ...linter.args(relative)], {
        cwd: projectRoot,
        encoding: 'utf8',
    });
    if (result.status === 0) return null;

    const output = (result.stdout || '') + (result.stderr || '');
    return output.trim() || result.error?.message || 'Lint error';
}
