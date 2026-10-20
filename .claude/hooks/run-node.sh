#!/usr/bin/env bash
# Runs a hook script of this folder with Node, wherever it is installed.
# Hooks run in a non-interactive shell where version managers (fnm, nvm, volta)
# have often not set the PATH, so `node` alone may be missing.
#
# Order: node on the PATH → fnm default alias → nvm default → volta → bun.
# Usage: bash .claude/hooks/run-node.sh <script.js> [args...]

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HOOKS_DIR/$1"
shift

find_node() {
    command -v node 2>/dev/null && return
    local candidates=(
        "${FNM_DIR:+$FNM_DIR/aliases/default/node.exe}"
        "${FNM_DIR:+$FNM_DIR/aliases/default/bin/node}"
        "${APPDATA:+$APPDATA/fnm/aliases/default/node.exe}"
        "$HOME/.local/share/fnm/aliases/default/bin/node"
        "$HOME/.fnm/aliases/default/bin/node"
        "$HOME/Library/Application Support/fnm/aliases/default/bin/node"
        "${NVM_DIR:-$HOME/.nvm}/alias/default"
        "$HOME/.volta/bin/node"
        "${LOCALAPPDATA:+$LOCALAPPDATA/Volta/bin/node.exe}"
    )
    local candidate
    for candidate in "${candidates[@]}"; do
        [ -n "$candidate" ] || continue
        # nvm stores the default version name in a text file, not a binary
        if [ "${candidate##*/}" = "default" ] && [ -f "$candidate" ]; then
            local version
            version="$(cat "$candidate")"
            candidate="$(ls -d "${NVM_DIR:-$HOME/.nvm}/versions/node/v${version#v}"*/bin/node 2>/dev/null | tail -n 1)"
        fi
        [ -n "$candidate" ] && [ -x "$candidate" ] && { echo "$candidate"; return; }
    done
    command -v bun 2>/dev/null
}

RUNTIME="$(find_node)"
if [ -z "$RUNTIME" ]; then
    # No JS runtime: never block the session because a hook cannot start.
    echo "hook skipped: neither node nor bun found" >&2
    exit 0
fi
exec "$RUNTIME" "$SCRIPT" "$@"
