import { File, Paths } from "expo-file-system";

// Each source manga's reading format (Aidoku `viewer`), as its source last
// reported it: one small JSON file in the document directory. Device-local —
// never synced, never sent to the server.

function viewerFile(): File {
  return new File(Paths.document, "nemu-source-manga-viewer-v1.json");
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
