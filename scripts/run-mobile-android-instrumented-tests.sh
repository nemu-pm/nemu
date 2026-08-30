#!/bin/sh

set -eu

NEMU_SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NEMU_REPOSITORY_ROOT=$(dirname "$NEMU_SCRIPT_DIR")
NEMU_ANDROID_ROOT="$NEMU_REPOSITORY_ROOT/apps/mobile/android"
NEMU_ANDROID_REPORTS="$NEMU_ANDROID_ROOT/build/reports"
NEMU_ANDROID_TEST_LOG="$NEMU_ANDROID_REPORTS/nemu-connected-android-test.log"
NEMU_ANDROID_LOGCAT="$NEMU_ANDROID_REPORTS/nemu-connected-android-logcat.txt"
NEMU_ANDROID_TEST_ARCHITECTURES=${NEMU_ANDROID_TEST_ARCHITECTURES:-x86_64}

mkdir -p "$NEMU_ANDROID_REPORTS"

set +e
"$NEMU_ANDROID_ROOT/gradlew" \
  --project-dir "$NEMU_ANDROID_ROOT" \
  --no-daemon \
  --console=plain \
  --max-workers=2 \
  :nemu-aidoku:connectedDebugAndroidTest \
  -PreactNativeArchitectures="$NEMU_ANDROID_TEST_ARCHITECTURES" \
  > "$NEMU_ANDROID_TEST_LOG" 2>&1
NEMU_ANDROID_TEST_STATUS=$?
set -e

tail -n +1 "$NEMU_ANDROID_TEST_LOG"
adb logcat -d > "$NEMU_ANDROID_LOGCAT" 2>&1 || true

exit "$NEMU_ANDROID_TEST_STATUS"
