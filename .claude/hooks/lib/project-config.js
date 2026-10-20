/**
 * Resolves the project profile shared by the hooks, agents and skills of this
 * `.claude/` toolkit, so the same files work in any JS/web project (with or
 * without Vite, Tauri, TypeScript, any package manager).
 *
 * Sources, by priority:
 *   1. `.claude/project.json` (optional, see `.claude/project.schema.json`)
 *   2. detection from the repository (lockfiles, package.json, src-tauri/...)
 *   3. defaults
 *
 * Lists (`protectedPaths`, `lint.exclude`) extend the defaults; an entry
 * starting with `!` removes a default instead (`"!dist/**"`).
 *
 * Run `bash .claude/hooks/run-node.sh project-context.js` to print the resolved profile.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONFIG_FILE = '.claude/project.json';

/** Lockfile → package manager, in detection order. */
const LOCKFILES = [
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
];

/** Command prefixes per package manager. */
const PM_COMMANDS = {
    bun: {
        run: 'bun run',
        exec: 'bunx',
        install: 'bun install',
        installFrozen: 'bun install --frozen-lockfile',
        add: 'bun add',
        audit: 'bun audit',
        outdated: 'bun outdated',
    },
    npm: {
        run: 'npm run',
        exec: 'npx',
        install: 'npm install',
        installFrozen: 'npm ci',
        add: 'npm install',
        audit: 'npm audit',
        outdated: 'npm outdated',
    },
    pnpm: {
        run: 'pnpm run',
        exec: 'pnpm exec',
        install: 'pnpm install',
        installFrozen: 'pnpm install --frozen-lockfile',
        add: 'pnpm add',
        audit: 'pnpm audit',
        outdated: 'pnpm outdated',
    },
    yarn: {
        run: 'yarn run',
        exec: 'yarn exec',
        install: 'yarn install',
        installFrozen: 'yarn install --immutable',
        add: 'yarn add',
        audit: 'yarn npm audit',
        outdated: 'yarn outdated',
    },
};

/** Logical script → candidate names in package.json, first match wins. */
const SCRIPT_CANDIDATES = {
    dev: ['dev', 'start', 'serve'],
    build: ['build'],
    test: ['test', 'test:unit'],
    coverage: ['test:coverage', 'coverage', 'test:cov'],
    e2e: ['test:e2e', 'e2e', 'playwright'],
    lint: ['lint'],
    typecheck: ['typecheck', 'type-check', 'tsc', 'check:types'],
    format: ['format', 'prettier'],
};

/** package.json dependency → stack flag. */
const STACK_DEPENDENCIES = {
    typescript: ['typescript'],
    vite: ['vite'],
    tauri: ['@tauri-apps/api', '@tauri-apps/cli'],
    vitest: ['vitest'],
    jest: ['jest'],
    playwright: ['@playwright/test', 'playwright'],
    eslint: ['eslint'],
    stylelint: ['stylelint'],
    htmlhint: ['htmlhint'],
    biome: ['@biomejs/biome'],
    sass: ['sass', 'sass-embedded'],
    tailwind: ['tailwindcss'],
    sentry: ['@sentry/browser', '@sentry/vite-plugin', 'tauri-plugin-sentry-api'],
};

const FRAMEWORK_DEPENDENCIES = {
    react: 'react',
    vue: 'vue',
    svelte: 'svelte',
    solid: 'solid-js',
    preact: 'preact',
    lit: 'lit',
    angular: '@angular/core',
    jquery: 'jquery',
};

const DEFAULT_PROTECTED_PATHS = [
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'dist/**',
    '**/*.jks',
    '**/*.keystore',
];

const DEFAULT_LINT_EXCLUDE = ['dist/**', 'build/**', 'coverage/**', 'vendor/**'];

/** Linter name → script inside node_modules and how to call it on one file. */
export const LINTER_COMMANDS = {
    eslint: { bin: 'node_modules/eslint/bin/eslint.js', args: (file) => [file] },
    stylelint: { bin: 'node_modules/stylelint/bin/stylelint.mjs', args: (file) => [file] },
    htmlhint: { bin: 'node_modules/htmlhint/bin/htmlhint', args: (file) => [file] },
    biome: { bin: 'node_modules/@biomejs/biome/bin/biome', args: (file) => ['lint', file] },
};

/**
 * Parsed JSON file, or null when it is missing or invalid.
 * @param {string} file
 */
function readJson(file) {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * First of `candidates` that exists under `root`, otherwise null.
 * @param {string} root
 * @param {string[]} candidates
 */
function firstExisting(root, candidates) {
    return candidates.find((candidate) => existsSync(path.join(root, candidate))) ?? null;
}

/**
 * Applies `overrides` on top of `defaults`: plain entries are added, `!entry`
 * removes `entry`.
 * @param {string[]} defaults
 * @param {unknown} overrides
 */
function mergeList(defaults, overrides) {
    const result = new Set(defaults);
    for (const entry of Array.isArray(overrides) ? overrides : []) {
        if (typeof entry !== 'string') continue;
        if (entry.startsWith('!')) result.delete(entry.slice(1));
        else result.add(entry);
    }
    return [...result];
}

/**
 * @param {string} root
 * @param {Record<string, any>} pkg
 * @param {Record<string, any>} config
 */
function detectPackageManager(root, pkg, config) {
    if (config.packageManager && config.packageManager !== 'auto') return config.packageManager;
    const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : '';
    if (declared in PM_COMMANDS) return declared;
    const lockfile = LOCKFILES.find(([file]) => existsSync(path.join(root, file)));
    return lockfile ? lockfile[1] : 'npm';
}

/**
 * @param {Record<string, string>} scripts package.json scripts
 * @param {Record<string, any>} configured `scripts` of project.json
 */
function resolveScripts(scripts, configured) {
    /** @type {Record<string, string | null>} */
    const result = {};
    for (const [name, candidates] of Object.entries(SCRIPT_CANDIDATES)) {
        result[name] =
            configured?.[name] !== undefined
                ? configured[name]
                : (candidates.find((candidate) => candidate in scripts) ?? null);
    }
    return result;
}

/**
 * @param {string} root
 * @param {Record<string, any>} deps
 * @param {Record<string, any>} configured `stack` of project.json
 * @param {string | null} tauriDir
 */
function resolveStack(root, deps, configured, tauriDir) {
    /** @type {Record<string, any>} */
    const stack = {};
    for (const [flag, packages] of Object.entries(STACK_DEPENDENCIES)) {
        stack[flag] = packages.some((name) => name in deps);
    }
    stack.typescript ||= existsSync(path.join(root, 'tsconfig.json'));
    stack.tauri ||= tauriDir !== null;
    stack.rust = existsSync(path.join(root, 'Cargo.toml')) ||
        (tauriDir !== null && existsSync(path.join(root, tauriDir, 'Cargo.toml')));
    stack.frameworks = Object.entries(FRAMEWORK_DEPENDENCIES)
        .filter(([, name]) => name in deps)
        .map(([framework]) => framework);
    stack.reuse = existsSync(path.join(root, 'REUSE.toml'));
    stack.sonar = existsSync(path.join(root, 'sonar-project.properties'));

    for (const [flag, value] of Object.entries(configured ?? {})) {
        if (value !== 'auto') stack[flag] = value;
    }
    return stack;
}

/**
 * @param {Record<string, any>} stack
 * @param {Record<string, any>} configured `lint.linters` of project.json
 * @returns {Record<string, string>} file extension → linter name
 */
function resolveLinters(stack, configured) {
    const scriptLinter = stack.biome && !stack.eslint ? 'biome' : 'eslint';
    /** @type {Record<string, string | null>} */
    const linters = {};
    for (const ext of ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']) {
        linters[ext] = scriptLinter;
    }
    if (stack.frameworks.includes('vue')) linters['.vue'] = 'eslint';
    if (stack.frameworks.includes('svelte')) linters['.svelte'] = 'eslint';
    for (const ext of ['.css', '.scss']) linters[ext] = 'stylelint';
    linters['.html'] = 'htmlhint';

    Object.assign(linters, configured ?? {});
    return /** @type {Record<string, string>} */ (
        Object.fromEntries(
            Object.entries(linters).filter(([, name]) => typeof name === 'string' && name in LINTER_COMMANDS)
        )
    );
}

/**
 * Resolved profile of the project rooted at `root`.
 * @param {string} root absolute project root
 */
export function loadProjectConfig(root) {
    const config = readJson(path.join(root, CONFIG_FILE)) ?? {};
    const pkg = readJson(path.join(root, 'package.json')) ?? {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };

    const tauriDir =
        config.paths?.tauri !== undefined
            ? config.paths.tauri
            : firstExisting(root, ['src-tauri']);
    const testsDir = config.paths?.tests ?? firstExisting(root, ['__tests__', 'tests', 'test']);
    const packageManager = detectPackageManager(root, pkg, config);
    const stack = resolveStack(root, deps, config.stack, tauriDir);

    const tauriProtected = tauriDir
        ? [`${tauriDir}/gen/**/tauri.*`, `${tauriDir}/gen/**/src/main/**`, `${tauriDir}/keystore*`]
        : [];

    return {
        root,
        configFile: existsSync(path.join(root, CONFIG_FILE)) ? CONFIG_FILE : null,
        name: config.name ?? pkg.productName ?? pkg.name ?? path.basename(root),
        description: config.description ?? pkg.description ?? '',
        packageManager,
        commands: PM_COMMANDS[/** @type {keyof typeof PM_COMMANDS} */ (packageManager)] ?? PM_COMMANDS.npm,
        scripts: resolveScripts(pkg.scripts ?? {}, config.scripts),
        stack,
        paths: {
            src: config.paths?.src ?? firstExisting(root, ['src']) ?? '.',
            tests: testsDir,
            e2e:
                config.paths?.e2e ??
                firstExisting(root, [testsDir ? `${testsDir}/e2e` : 'e2e', 'e2e', 'tests/e2e']),
            styles: config.paths?.styles ?? firstExisting(root, ['src/scss', 'src/styles', 'src/css']),
            tauri: tauriDir,
        },
        coverage: config.coverage ?? null,
        bundleBudget: config.bundleBudget ?? null,
        protectedPaths: mergeList([...DEFAULT_PROTECTED_PATHS, ...tauriProtected], config.protectedPaths),
        lint: {
            exclude: mergeList(DEFAULT_LINT_EXCLUDE, config.lint?.exclude),
            linters: resolveLinters(stack, config.lint?.linters),
        },
        conventions: mergeList(
            ['CLAUDE.md', 'AGENTS.md', 'CONTRIBUTING.md'].filter((file) => existsSync(path.join(root, file))),
            config.conventions
        ),
        notes: Array.isArray(config.notes) ? config.notes : [],
    };
}
