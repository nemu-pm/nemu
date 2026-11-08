import { File, Paths } from "expo-file-system";

// Each source manga's reading format (Aidoku `viewer`), as its source last
// reported it: one small JSON file in the document directory. Device-local —
// never synced, never sent to the server.

function viewerFile(): File {
  // v1 kept 1 and 2 as each source's ABI numbered them, so they cannot be read
  // as a direction; the reader asks the source again.
  return new File(Paths.document, "nemu-source-manga-viewer-v2.json");
}

export async function readMobileSourceMangaViewerText(): Promise<string | null> {
  try {
    const file = viewerFile();
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeMobileSourceMangaViewerText(text: string): Promise<void> {
  try {
    viewerFile().write(text);
  } catch {
    // Losing it only means the page sizes decide the scroll spacing again.
  }
}
