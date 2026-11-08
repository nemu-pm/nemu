import { File, Paths } from "expo-file-system";

// Where you stopped in each chapter on this device: one small JSON file in
// the document directory (kept under storage pressure, removed with the
// app). Device-local by design — never synced, never sent to the server.

function resumeFile(): File {
  return new File(Paths.document, "nemu-reader-resume-v1.json");
}

export async function readMobileReaderResumeText(): Promise<string | null> {
  try {
    const file = resumeFile();
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeMobileReaderResumeText(text: string): Promise<void> {
  try {
    resumeFile().write(text);
  } catch {
    // Losing a resume spot only means reopening at the synced page.
  }
}
