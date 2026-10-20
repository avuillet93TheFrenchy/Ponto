/**
 * PreToolUse hook — File protection
 *
 * Blocks Edit/Write/NotebookEdit operations, and Bash commands that write,
 * on protected paths (`protectedPaths` of .claude/project.json plus the
 * defaults of ./lib/project-config.js, see ./lib/protected-paths.js).
 * Receives tool call context via stdin as JSON.
 * Exit code 2 = block the operation and report the error.
 *
 * Relative paths are resolved from the directory the tool call runs in
 * (`cwd` of the payload), so the hook behaves the same from any sub-folder.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    protectedPath,
    protectedPathInCommand,
} from './lib/protected-paths.js';

const PROJECT_ROOT =
    process.env.CLAUDE_PROJECT_DIR ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
    try {
        const json = JSON.parse(input);
        const cwd = json.cwd || process.cwd();
        const toolInput = json.tool_input ?? {};
        const filePath =
            toolInput.file_path || toolInput.notebook_path || toolInput.path;

        const blocked = filePath
            ? protectedPath(path.resolve(cwd, filePath), PROJECT_ROOT)
            : protectedPathInCommand(toolInput.command, cwd, PROJECT_ROOT);

        if (blocked) {
            console.error(
                `BLOCKED: ${blocked} should not be modified directly`
            );
            process.exit(2);
        }
    } catch {
        // Invalid JSON input — allow the operation
    }
});
