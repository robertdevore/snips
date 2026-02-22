#!/bin/zsh
set -euo pipefail

# Builds SnipsHelper in release mode.
# We try to build both x86_64 and arm64 variants when possible so electron-builder
# can package a runnable helper for each app architecture (even if this shell is
# running under Rosetta).

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_DIR="$ROOT_DIR/helper"

cd "$HELPER_DIR"

set +e
swift build -c release --arch x86_64
X64_STATUS=$?

swift build -c release --arch arm64
ARM_STATUS=$?
set -e

if [[ $X64_STATUS -ne 0 && $ARM_STATUS -ne 0 ]]; then
	print -u2 "Helper build failed for both architectures."
	exit 1
fi

if [[ $X64_STATUS -ne 0 ]]; then
	print -u2 "Warning: helper x86_64 build failed; arm64 build succeeded."
fi

if [[ $ARM_STATUS -ne 0 ]]; then
	print -u2 "Warning: helper arm64 build failed; x86_64 build succeeded."
fi
