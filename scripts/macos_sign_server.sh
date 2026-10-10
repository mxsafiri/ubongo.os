#!/usr/bin/env bash
# Sign every Mach-O file in the PyInstaller server bundle with a Developer ID
# and the hardened runtime, so the app passes notarization. Inner libraries
# first, the ubongo-server executable last.
#
#   scripts/macos_sign_server.sh <bundle dir> "<signing identity>" <entitlements.plist>
set -euo pipefail
DIR="$1"
IDENTITY="$2"
ENTITLEMENTS="$3"

sign() {
  codesign --force --timestamp --options runtime \
    --entitlements "$ENTITLEMENTS" --sign "$IDENTITY" "$1"
}

count=0
while IFS= read -r -d '' f; do
  if file -b "$f" | grep -q "Mach-O"; then
    sign "$f"
    count=$((count + 1))
  fi
done < <(find "$DIR" -type f ! -path "$DIR/ubongo-server" -print0)

sign "$DIR/ubongo-server"
codesign --verify --strict --verbose=2 "$DIR/ubongo-server"
echo "Signed $count libraries and the ubongo-server executable"
