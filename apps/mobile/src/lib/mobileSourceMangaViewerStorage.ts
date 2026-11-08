// Base (non-native) storage for the remembered source viewers: in memory
// only. Metro resolves `mobileSourceMangaViewerStorage.native.ts` on iOS and
// Android; bun's test runner and Expo web resolve this file.

let text: string | null = null;

export async function readMobileSourceMangaViewerText(): Promise<string | null> {
  return text;
}

export async function writeMobileSourceMangaViewerText(next: string): Promise<void> {
  text = next;
}
