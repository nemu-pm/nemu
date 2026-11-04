// Base (non-native) storage for the local resume positions: in memory only.
// Metro resolves `mobileReaderResumePositionStorage.native.ts` on iOS and
// Android; bun's test runner and Expo web resolve this file.

let text: string | null = null;

export async function readMobileReaderResumeText(): Promise<string | null> {
  return text;
}

export async function writeMobileReaderResumeText(next: string): Promise<void> {
  text = next;
}
