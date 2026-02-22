#!/bin/zsh
set -euo pipefail

# Build x64 DMG (always) and attempt arm64 DMG (when supported).
# electron-builder does not always build both architectures in one invocation.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

electron-builder --mac dmg --x64

set +e
electron-builder --mac dmg --arm64
ARM_STATUS=$?
set -e

if [[ $ARM_STATUS -ne 0 ]]; then
	print -u2 "Warning: arm64 DMG build failed; x64 DMG was built."
fi
