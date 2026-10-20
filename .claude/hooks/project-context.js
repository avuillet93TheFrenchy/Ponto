/**
 * Prints the resolved project profile as JSON: `.claude/project.json` merged
 * with what is detected from the repository (package manager, stack, scripts,
 * paths...). Agents and skills run it first instead of guessing:
 *
 *   bash .claude/hooks/run-node.sh project-context.js
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectConfig } from './lib/project-config.js';

const PROJECT_ROOT =
    process.env.CLAUDE_PROJECT_DIR ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

process.stdout.write(JSON.stringify(loadProjectConfig(PROJECT_ROOT), null, 2) + '\n');
