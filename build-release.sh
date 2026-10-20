#!/usr/bin/env bash
# Builds Ponto for Linux (AppImage, .deb, .rpm) with the updater signing key of THIS project only.
#
# Runs the checks, then the Tauri build. The signing key is passed to the build process through
# TAURI_SIGNING_PRIVATE_KEY (set to a path, the key is never read by this script) and the password
# is asked interactively. Both exist only in the environment of the build process.
#
# Usage: ./build-release.sh [--key <path>] [--notes <text>] [--merge <latest.json>] [--skip-checks]
#   --key          Ponto's updater private key (default: ~/.tauri/ponto.key)
#   --notes        release notes written in latest.json (empty by default)
#   --merge        latest.json built on another machine (e.g. Windows), its platforms are kept
#   --skip-checks  skips `pnpm lint` and `pnpm typecheck`
set -euo pipefail
cd "$(dirname "$0")"

key_path="$HOME/.tauri/ponto.key"
notes=""
skip_checks=0
merge_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --key) key_path="${2:?--key demande un chemin}"; shift 2 ;;
    --notes) notes="${2:?--notes demande un texte}"; shift 2 ;;
    --merge) merge_args+=(--merge "${2:?--merge demande un chemin}"); shift 2 ;;
    --skip-checks) skip_checks=1; shift ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
done

if [ ! -f "$key_path" ]; then
  echo "Clé de signature introuvable : $key_path (utilisez --key)." >&2
  exit 1
fi
read -rsp 'Mot de passe de la clé de signature de Ponto : ' password
echo

if [ "$skip_checks" -eq 0 ]; then
  echo '== Vérifications (lint, typecheck) =='
  pnpm lint
  pnpm typecheck
fi

echo '== Compilation Linux (AppImage, .deb, .rpm) =='
TAURI_SIGNING_PRIVATE_KEY="$(realpath "$key_path")" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$password" \
  pnpm tauri:build:linux

version="$(node -p "require('./src-tauri/tauri.conf.json').version")"
name="$(node -p "require('./src-tauri/tauri.conf.json').productName")"
appimage_dir='src-tauri/target/release/bundle/appimage'
node scripts/updater-manifest.js \
  --platform linux-x86_64 \
  --file "$appimage_dir/${name}_${version}_amd64.AppImage" \
  --out "$appimage_dir/latest.json" \
  --notes "$notes" \
  "${merge_args[@]}"

echo 'Terminé.'
