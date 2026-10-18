#!/bin/bash
set -euo pipefail
# On macOS: validate-ocr.sh [test | modelsDir pagesDir output.json]
# For iOS Simulator set NEMU_OCR_SIMULATOR to a booted simulator UUID.
module_dir="$(cd "$(dirname "$0")/.." && pwd)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/nemu-ocr-validation.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT
sources=("$module_dir"/ios/NemuManga*.swift "$module_dir/ios/NemuTextOrder.swift" "$module_dir/ios/NemuTextRecognizer.swift" "$module_dir/scripts/ocr-validation/main.swift")
if [ -n "${NEMU_OCR_SIMULATOR:-}" ]; then
  xcrun --sdk iphonesimulator swiftc -O -target arm64-apple-ios18.0-simulator -o "$work_dir/validate" "${sources[@]}"
  xcrun simctl spawn "$NEMU_OCR_SIMULATOR" "$work_dir/validate" "${@:-test}"
else
  xcrun swiftc -O -o "$work_dir/validate" "${sources[@]}"
  "$work_dir/validate" "${@:-test}"
fi
