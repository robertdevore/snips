#!/bin/zsh
set -euo pipefail
: "${SNIPS_NOTARY_PROFILE:?Set SNIPS_NOTARY_PROFILE to a notarytool Keychain profile}"
if [[ $# -ne 1 || ! -f "$1" ]]; then print -u2 'Usage: scripts/notarize-release.sh <signed.dmg>'; exit 2; fi
xcrun notarytool submit "$1" --keychain-profile "$SNIPS_NOTARY_PROFILE" --wait
xcrun stapler staple "$1"
xcrun stapler validate "$1"
shasum -a 256 "$1"
