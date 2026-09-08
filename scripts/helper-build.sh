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

# Release signing is explicit; development binaries remain unsigned.
if [[ -n "${SNIPS_SIGNING_IDENTITY:-}" ]]; then
 for ARCH in x86_64 arm64; do
  /usr/bin/codesign --force --options runtime --timestamp --sign "$SNIPS_SIGNING_IDENTITY" ".build/${ARCH}-apple-macosx/release/SnipsHelper"
 done
fi

# Package the helper as a stable app identity. Copy this bundle intact during upgrades.
for ARCH in x86_64 arm64; do
 RELEASE_DIR="$HELPER_DIR/.build/${ARCH}-apple-macosx/release"
 [[ -f "$RELEASE_DIR/SnipsHelper" ]] || continue
 HELPER_APP="$RELEASE_DIR/SnipsHelper.app"
 mkdir -p "$HELPER_APP/Contents/MacOS"
 cp "$RELEASE_DIR/SnipsHelper" "$HELPER_APP/Contents/MacOS/SnipsHelper"
 cat > "$HELPER_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SnipsHelper</string>
<key>CFBundleIdentifier</key><string>com.snips.helper</string>
<key>CFBundleName</key><string>SnipsHelper</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.5.0</string>
<key>CFBundleVersion</key><string>0.5.0</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
 if [[ -n "${SNIPS_SIGNING_IDENTITY:-}" ]]; then
  /usr/bin/codesign --force --options runtime --timestamp --sign "$SNIPS_SIGNING_IDENTITY" "$HELPER_APP"
 else
  /usr/bin/codesign --force --sign - "$HELPER_APP"
 fi
 /usr/bin/codesign --verify --strict "$HELPER_APP"
done
