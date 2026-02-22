#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ICON_PNG="$ROOT_DIR/app/build/icon.png"

if [[ -f "$ICON_PNG" ]]; then
	cd "$ROOT_DIR"
	npm -s run make:icns --workspace app
	exit 0
fi

print -u2 "Warning: app/build/icon.png not found; using default app icon."
exit 0
