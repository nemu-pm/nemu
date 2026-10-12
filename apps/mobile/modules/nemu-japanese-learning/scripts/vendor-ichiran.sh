#!/usr/bin/env bash
# Rebuilds the on-device Ichiran analyzer that the NemuJapaneseLearning pod
# links: TigerHix/ichiran-node's Rust kernel (static XCFramework, C ABI v5)
# plus its IchiranSwift host sources, adapted to compile inside this pod.
#
# Output (gitignored, ~80 MB of static archives before linking):
#   ios/Vendor/IchiranKernel.xcframework   iOS device + simulator slices
#   ios/Vendor/IchiranSwift/*.swift        pinned host sources (import fixups)
#   ios/Vendor/PROVENANCE.txt              commit, toolchain and checksums
#
# Without Vendor/ the pod still builds; the analyzer then reports itself
# unavailable and the app keeps the cloud path.
#
# Pin: the last ichiran-node commit whose kernel and Swift manifest reader are
# pack format 1, i.e. compatible with the published release
# `portable-core-260118-baseline` (hot.bin.gz + details.bin.gz). Later commits
# (0cfda05+) require format 2 packs that are not published yet.
#
# Usage: modules/nemu-japanese-learning/scripts/vendor-ichiran.sh [WORK_DIR]
set -euo pipefail

ICHIRAN_REPOSITORY="${ICHIRAN_REPOSITORY:-https://github.com/TigerHix/ichiran-node.git}"
ICHIRAN_COMMIT="35dcfdccdb153b3c2528f75816dd2436809087cb"
RUST_TOOLCHAIN="1.92.0"
RUST_TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios aarch64-apple-darwin x86_64-apple-darwin)

module_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vendor_dir="$module_dir/ios/Vendor"
work_dir="${1:-${TMPDIR:-/tmp}/nemu-ichiran-vendor}"
checkout="$work_dir/ichiran-node"

fail() {
  echo "vendor-ichiran: $*" >&2
  exit 1
}

[ "$(uname -s)" = Darwin ] || fail "requires macOS with Xcode"
for rustup_dir in /opt/homebrew/opt/rustup/bin /opt/homebrew/bin "$HOME/.cargo/bin"; do
  [ -x "$rustup_dir/rustup" ] && PATH="$rustup_dir:$PATH"
done
export PATH
for command in git rustup xcodebuild xcrun lipo shasum; do
  command -v "$command" >/dev/null || fail "missing required tool: $command"
done

rustup toolchain install "$RUST_TOOLCHAIN" --profile minimal >/dev/null
rustup target add --toolchain "$RUST_TOOLCHAIN" "${RUST_TARGETS[@]}" >/dev/null

mkdir -p "$work_dir"
if [ ! -d "$checkout/.git" ]; then
  git clone --filter=blob:none "$ICHIRAN_REPOSITORY" "$checkout"
fi
git -C "$checkout" fetch --quiet origin "$ICHIRAN_COMMIT" || true
git -C "$checkout" checkout --quiet --detach "$ICHIRAN_COMMIT"
[ "$(git -C "$checkout" rev-parse HEAD)" = "$ICHIRAN_COMMIT" ] || fail "checkout is not $ICHIRAN_COMMIT"

# Upstream's own build + audit (arch, 17-symbol ABI v5 export set, ABI probe).
"$checkout/apple/scripts/build-xcframework.sh"

crate="$checkout/packages/rust-kernel"
device="$crate/target/aarch64-apple-ios/release/libichiran_kernel.a"
simulator="$checkout/work/apple/xcframework/libichiran_kernel-simulator.a"
headers="$work_dir/headers"
for archive in "$device" "$simulator"; do
  [ -s "$archive" ] || fail "missing archive: $archive"
done

rm -rf "$vendor_dir" "$headers"
mkdir -p "$vendor_dir/IchiranSwift" "$headers"
cp "$crate/include/ichiran_kernel.h" "$crate/include/module.modulemap" "$headers/"

# iOS-only XCFramework (the pod never links the macOS slice). CocoaPods
# requires every slice's archive to share one file name.
mkdir -p "$work_dir/slices/device" "$work_dir/slices/simulator"
cp "$device" "$work_dir/slices/device/libichiran_kernel.a"
cp "$simulator" "$work_dir/slices/simulator/libichiran_kernel.a"
xcodebuild -create-xcframework \
  -library "$work_dir/slices/device/libichiran_kernel.a" -headers "$headers" \
  -library "$work_dir/slices/simulator/libichiran_kernel.a" -headers "$headers" \
  -output "$vendor_dir/IchiranKernel.xcframework" >/dev/null

# IchiranSwift compiles as part of this pod's Swift module. The SwiftPM-only
# `CZlib` system-library shim is replaced by the SDK's own `zlib` module;
# nothing else is modified.
for source in "$checkout"/apple/IchiranSwift/Sources/IchiranSwift/*.swift; do
  name="$(basename "$source")"
  {
    echo "// Vendored from ichiran-node@$ICHIRAN_COMMIT apple/IchiranSwift/Sources/IchiranSwift/$name"
    echo "// by modules/nemu-japanese-learning/scripts/vendor-ichiran.sh. Do not edit."
    sed -e 's/^import CZlib$/import zlib/' "$source"
  } > "$vendor_dir/IchiranSwift/$name"
done
cp "$checkout/LICENSE" "$vendor_dir/LICENSE-ichiran-node.md"

{
  echo "repository: $ICHIRAN_REPOSITORY"
  echo "commit: $ICHIRAN_COMMIT"
  echo "toolchain: $(rustup run "$RUST_TOOLCHAIN" rustc --version)"
  echo "xcode: $(xcodebuild -version | tr '\n' ' ')"
  echo "device_archive_sha256: $(shasum -a 256 "$device" | awk '{print $1}')"
  echo "simulator_archive_sha256: $(shasum -a 256 "$simulator" | awk '{print $1}')"
  echo "xcframework_bytes: $(find "$vendor_dir/IchiranKernel.xcframework" -type f -exec stat -f %z {} + | awk '{s+=$1} END {print s}')"
  for source in "$vendor_dir"/IchiranSwift/*.swift; do
    echo "swift_sha256: $(shasum -a 256 "$source" | awk '{print $1}')  $(basename "$source")"
  done
} > "$vendor_dir/PROVENANCE.txt"

cat "$vendor_dir/PROVENANCE.txt"
echo "vendor-ichiran: done. Run 'pod install' in apps/mobile/ios to link it."
