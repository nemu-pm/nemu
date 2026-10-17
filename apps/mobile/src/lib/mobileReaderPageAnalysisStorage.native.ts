import { Directory, File, Paths } from "expo-file-system";

// One small JSON file per chapter in the cache directory: derived numbers
// the analyzer can always measure again, so the system may purge them.
const DIRECTORY_NAME = "nemu-page-analysis-v1";

function directory(): Directory {
  return new Directory(Paths.cache, DIRECTORY_NAME);
}

export async function readMobileReaderPageAnalysisText(name: string): Promise<string | null> {
  try {
    const file = new File(directory(), `${name}.json`);
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeMobileReaderPageAnalysisText(name: string, text: string): Promise<void> {
  try {
    const folder = directory();
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
    new File(folder, `${name}.json`).write(text);
  } catch {
    // A cache write that fails only means measuring again next time.
  }
}
