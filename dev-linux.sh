#!/usr/bin/env bash
# Interactive helper for Linux development: installs dependencies, frees port 5173, clears the
# incremental Rust cache, or launches `tauri dev`. Needs the system packages listed in
# .github/workflows/linux.yml (WebKitGTK, etc.).
set -uo pipefail
cd "$(dirname "$0")"

install_dependencies() {
  echo 'Installing dependencies...'
  pnpm install --ignore-scripts
}

clear_port() {
  echo 'Clearing port 5173...'
  if ! command -v fuser >/dev/null 2>&1; then
    echo 'fuser is missing (package psmisc): stop the process using port 5173 by hand.'
    return
  fi
  if fuser -k 5173/tcp 2>/dev/null; then
    echo 'Process stopped.'
  else
    echo 'Port already free.'
  fi
}

clear_incremental_cache() {
  local dir='src-tauri/target/debug/incremental'
  if [ ! -d "$dir" ]; then
    echo 'No incremental cache found.'
    return
  fi
  if [ -n "$(find "$dir" -type l -print -quit)" ] || [ -L "$dir" ]; then
    echo "Refusing to clean $dir : it contains a symbolic link. Inspect it and delete it manually."
    return
  fi
  rm -rf -- "$dir"
  echo 'Cache removed.'
}

start_tauri() {
  echo 'Launching Tauri...'
  CARGO_INCREMENTAL=0 pnpm tauri dev
}

while true; do
  echo '===================================='
  echo ' Linux Dev Menu'
  echo '===================================='
  echo '[1] Install dependencies'
  echo '[2] Clean port 5173'
  echo '[3] Launch Tauri'
  echo '[4] Clean incremental Rust cache'
  echo '[0] Quit'
  read -rp 'Choice: ' choice
  case "$choice" in
    1) install_dependencies ;;
    2) clear_port ;;
    3) start_tauri ;;
    4) clear_incremental_cache ;;
    0) exit 0 ;;
  esac
  read -rp 'Press Enter to continue' _
done
