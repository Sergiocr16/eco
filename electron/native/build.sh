#!/usr/bin/env bash
# Compila eco-stt para arm64 + x86_64 y los une en un binario universal.
# Output: ../build/bin/eco-stt
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/eco-stt.swift"
OUT_DIR="$DIR/../build/bin"
OUT="$OUT_DIR/eco-stt"

mkdir -p "$OUT_DIR"

# Compilamos para ambas arquitecturas — el dmg incluye los dos targets.
echo "[eco-stt] compilando arm64…"
swiftc -O -target arm64-apple-macos11.0 -o "$OUT.arm64" "$SRC"
echo "[eco-stt] compilando x86_64…"
swiftc -O -target x86_64-apple-macos11.0 -o "$OUT.x64" "$SRC"

# Unimos en un fat binary.
echo "[eco-stt] lipo → universal…"
lipo -create -output "$OUT" "$OUT.arm64" "$OUT.x64"
rm -f "$OUT.arm64" "$OUT.x64"

chmod +x "$OUT"
echo "[eco-stt] listo: $OUT"
lipo -info "$OUT"
