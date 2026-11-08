import { File, Paths } from "expo-file-system";

// The reading mode the user picked for a title in the reader: one small JSON
// file in the document directory. Device-local — never synced, never sent to
// the server.

function modesFile(): File {
  return new File(Paths.document, "nemu-reader-title-reading-mode-v1.json");
}

export async function readMobileReaderTitleReadingModeText(): Promise<string | null> {
  try {
    const file = modesFile();
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeMobileReaderTitleReadingModeText(text: string): Promise<void> {
  try {
    modesFile().write(text);
  } catch {
    // Losing it only means the title follows its source again.
  }
}
