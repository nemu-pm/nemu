import { File, Paths } from "expo-file-system";

// The "Share crash reports" choice: one tiny file in the document directory,
// read synchronously when the bundle starts (before Sentry would start) and
// device-local on purpose: it is not a synced setting, and "Clear all data"
// leaves it alone so an opt-out never silently turns back on.
const FILE_NAME = "nemu-crash-reports-v1.txt";

export function readMobileCrashReportsChoiceText(): string | null {
  try {
    const file = new File(Paths.document, FILE_NAME);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

export function writeMobileCrashReportsChoiceText(text: string): void {
  try {
    new File(Paths.document, FILE_NAME).writeSync(text);
  } catch {
    // Best effort: the choice still applies to this session.
  }
}
