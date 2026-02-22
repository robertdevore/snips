#!/bin/zsh
set -euo pipefail

# Generates app/build/icon.icns from app/build/icon.png
# Requirements: macOS (sips + iconutil)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_PNG="$ROOT_DIR/build/icon.png"
ICONSET_DIR="$ROOT_DIR/build/icon.iconset"
OUT_ICNS="$ROOT_DIR/build/icon.icns"

if [[ ! -f "$SRC_PNG" ]]; then
	print -u2 "Missing $SRC_PNG"
	print -u2 "Save your source PNG to app/build/icon.png and re-run."
	exit 1
fi

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

# iconutil expects these filenames
sips -z 16 16 "$SRC_PNG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
sips -z 32 32 "$SRC_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null

sips -z 32 32 "$SRC_PNG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
sips -z 64 64 "$SRC_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null

sips -z 128 128 "$SRC_PNG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
sips -z 256 256 "$SRC_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null

sips -z 256 256 "$SRC_PNG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
sips -z 512 512 "$SRC_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null

sips -z 512 512 "$SRC_PNG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$SRC_PNG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$ICONSET_DIR" -o "$OUT_ICNS"
rm -rf "$ICONSET_DIR"

print "Wrote $OUT_ICNS" 
