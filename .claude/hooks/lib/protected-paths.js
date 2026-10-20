/**
 * Protected-path rules shared by the pre-edit hooks (other agents' hooks, such
 * as .codex/hooks or .vibe/hooks, can import this file too), so the rules live
 * in one place and cannot drift between tools.
 *
 * The protected globs come from the project profile (`protectedPaths` in
 * `.claude/project.json`, on top of the defaults of ./project-config.js).
 * `.env` files and node_modules are always protected.
 *
 * Paths are matched relative to the project root, so the result does not depend
 * on the current working directory, drive-letter case or path separators.
 */

import path from 'node:path';
import { matchAny } from './glob.js';
import { loadProjectConfig } from './project-config.js';

/** @type {Map<string, string[]>} project root → protected globs */
const patternsCache = new Map();

/**
 * Protected globs of the project, loaded once per hook run.
 * @param {string} projectRoot
 */
function protectedPatterns(projectRoot) {
    let patterns = patternsCache.get(projectRoot);
    if (!patterns) {
        patterns = loadProjectConfig(projectRoot).protectedPaths;
        patternsCache.set(projectRoot, patterns);
    }
    return patterns;
}
// Plain string matching instead of a regex: any regex form of this check still
// trips security/detect-unsafe-regex.
const ENV_NAME = '.env';
const ENV_PREFIX = '.env.';
const ENV_EXAMPLE_SUFFIX = '.example';

// Shell commands are analysed per segment (split on `;`, `&&`, `||`, `|`, newlines).
// Reading a protected file (`cat bun.lock`, `node node_modules/x.js 2>&1`) stays
// allowed: only a write verb's arguments or a redirection target can be blocked.
const SEGMENT_SEPARATORS = /&&|\|\||[;|\n]/;
const WORD_SEPARATORS = /[\s;&|<>()"'`=,]+/;
// `>` / `>>` / `2>` followed by a target; `2>&1` has no target and never matches.
const REDIRECT_TARGET = /\d?>>?\s*([^\s;&|<>]+)/g;
const WRITE_VERBS = new Set([
    'tee', 'mv', 'cp', 'rm', 'del', 'erase', 'ren', 'truncate', 'dd', 'ln',
    'touch', 'chmod', 'chown', 'rsync',
    'set-content', 'add-content', 'out-file', 'remove-item', 'move-item',
    'copy-item', 'new-item',
]);
const GIT_WRITE_SUBCOMMANDS = new Set(['checkout', 'restore', 'apply', 'rm', 'mv']);
const IN_PLACE_EDITORS = new Set(['sed', 'perl']);
const IN_PLACE_FLAG = /^-\w*i/;

/**
 * True for `.env` and `.env.<anything>` file names (not `config.env.js`),
 * except `.env.*.example` templates which are meant to be committed.
 * @param {string} fileName
 */
function isProtectedEnvFile(fileName) {
    const isEnv = fileName === ENV_NAME || fileName.startsWith(ENV_PREFIX);
    return isEnv && !fileName.endsWith(ENV_EXAMPLE_SUFFIX);
}

/**
 * Display path of `absolute` when it is protected, otherwise null.
 * node_modules is protected wherever it sits; the other rules only apply
 * inside the project.
 * @param {string} absolute
 * @param {string} projectRoot
 * @returns {string | null}
 */
export function protectedPath(absolute, projectRoot) {
    const relative = path
        .relative(projectRoot, absolute)
        .replaceAll('\\', '/');
    const outsideProject =
        relative.startsWith('../') || path.isAbsolute(relative);

    if (absolute.replaceAll('\\', '/').includes('/node_modules/')) {
        return outsideProject ? absolute.replaceAll('\\', '/') : relative;
    }
    if (outsideProject) return null;

    const isProtected =
        matchAny(protectedPatterns(projectRoot), relative) ||
        isProtectedEnvFile(path.basename(absolute));
    return isProtected ? relative : null;
}

/** True when one command segment contains a verb that writes to its arguments. */
function hasWriteVerb(words) {
    const lower = words.map((word) => word.toLowerCase());
    if (lower.some((word) => WRITE_VERBS.has(word))) return true;
    if (lower.some((word) => IN_PLACE_EDITORS.has(word)) && words.some((word) => IN_PLACE_FLAG.test(word))) {
        return true;
    }
    const gitAt = lower.indexOf('git');
    return gitAt !== -1 && GIT_WRITE_SUBCOMMANDS.has(lower[gitAt + 1]);
}

/** First protected path among the given tokens, otherwise null. */
function firstProtected(tokens, cwd, projectRoot) {
    for (const token of tokens) {
        if (!token || token.startsWith('-')) continue;
        const hit = protectedPath(path.resolve(cwd, token), projectRoot);
        if (hit) return hit;
    }
    return null;
}

/**
 * First protected path a shell command writes to, otherwise null.
 * Best effort on purpose (it cannot understand every shell construct): it
 * catches `> bun.lock`, `rm dist/a.js`, `sed -i dist/x.js`, `git checkout
 * package-lock.json`... A protected directory named on its own (`rm -rf dist`) is allowed.
 * @param {string} command
 * @param {string} cwd directory the command runs from
 * @param {string} projectRoot
 * @returns {string | null}
 */
export function protectedPathInCommand(command, cwd, projectRoot) {
    if (typeof command !== 'string') return null;

    for (const segment of command.split(SEGMENT_SEPARATORS)) {
        const redirected = [...segment.matchAll(REDIRECT_TARGET)].map((m) => m[1]);
        const hit =
            firstProtected(redirected, cwd, projectRoot) ||
            (hasWriteVerb(segment.split(WORD_SEPARATORS))
                ? firstProtected(segment.split(WORD_SEPARATORS), cwd, projectRoot)
                : null);
        if (hit) return hit;
    }
    return null;
}
