// Base (non-native) storage for the "Share crash reports" choice: in memory
// only. Metro resolves `mobileCrashReportsStorage.native.ts` on iOS/Android;
// bun's test runner and Expo web resolve this file.

let stored: string | null = null;

export function readMobileCrashReportsChoiceText(): string | null {
  return stored;
}

export function writeMobileCrashReportsChoiceText(text: string): void {
  stored = text;
}
