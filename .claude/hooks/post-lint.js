/**
 * PostToolUse hook — Auto lint
 *
 * Runs the appropriate linter after each Edit/Write on a script, style or HTML file
 * (extension → linter map and exclusions from the project profile, see
 * ./lib/lint-file.js and .claude/project.json).
 * Receives tool call context via stdin as JSON.
 * Exit code 2 = report the lint error back to Claude.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintFile } from './lib/lint-file.js';

const PROJECT_ROOT =
    process.env.CLAUDE_PROJECT_DIR ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
    try {
        const json = JSON.parse(input);
        const rawPath = json.tool_input?.file_path || '';
        if (!rawPath) return;

        // Relative paths are resolved from where the tool call ran (any sub-folder).
        const errors = lintFile(
            path.resolve(json.cwd || process.cwd(), rawPath),
            PROJECT_ROOT
        );
        if (errors) {
            process.stderr.write(errors + '\n');
            process.exit(2);
        }
    } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
    }
});
