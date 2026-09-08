#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -m)" == arm64 ]]; then ARCH=arm64; else ARCH=x86_64; fi
"helper/.build/${ARCH}-apple-macosx/release/SnipsHelper" --self-test
python3 scripts/performance/focus-regression.py
python3 scripts/performance/event-regression.py
node scripts/helper-ipc-test.cjs
