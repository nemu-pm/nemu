// Base (non-native) storage for per-title reading modes: in memory only. Metro
// resolves `mobileReaderTitleReadingModeStorage.native.ts` on iOS and Android;
// bun's test runner and Expo web resolve this file.

let text: string | null = null;

export async function readMobileReaderTitleReadingModeText(): Promise<string | null> {
  return text;
}

export async function writeMobileReaderTitleReadingModeText(next: string): Promise<void> {
  text = next;
}
