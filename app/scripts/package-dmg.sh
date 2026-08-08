#!/bin/zsh
set -euo pipefail

# Build release DMGs for both supported architectures and write checksums.
# electron-builder does not always build both architectures in one invocation.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

electron-builder --mac dmg --x64
electron-builder --mac dmg --arm64

VERSION="$(node -p "require('./package.json').version")"
X64_DMG="dist/Snips-${VERSION}.dmg"
ARM64_DMG="dist/Snips-${VERSION}-arm64.dmg"

if [[ ! -f "$X64_DMG" || ! -f "$ARM64_DMG" ]]; then
	print -u2 "Expected release DMGs were not produced."
	exit 1
fi

(
	cd dist
	shasum -a 256 "${X64_DMG:t}" "${ARM64_DMG:t}" > SHA256SUMS.txt
)
