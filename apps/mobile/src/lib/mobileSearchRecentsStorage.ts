// Base (non-native) storage for recent searches: in memory only. Metro
// resolves `mobileSearchRecentsStorage.native.ts` on iOS/Android; bun's test
// runner and Expo web resolve this file (no `expo-file-system` import).

const files = new Map<string, string>();

export async function readMobileSearchRecentsText(key: string): Promise<string | null> {
  return files.get(key) ?? null;
}

export async function writeMobileSearchRecentsText(key: string, text: string): Promise<void> {
  files.set(key, text);
}
