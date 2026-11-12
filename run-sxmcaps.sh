#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_BIN="$ROOT_DIR/src-tauri/target/release/sxmcaps"

if [[ -x "$RELEASE_BIN" ]]; then
  exec "$RELEASE_BIN" "$@"
else
  cd "$ROOT_DIR"
  exec npm run tauri dev
fi
