import { File, Paths } from "expo-file-system";

// Device-wide welcome-completion marker (see the base
// `mobileWelcomeDeviceCompletion.ts` for why it exists).
//
// A file in the document directory rather than SecureStore: the iOS keychain
// survives an uninstall, and a reinstall is a genuinely new install that must
// see first-run onboarding again. The document directory is removed with the
// app, is not purged under storage pressure like the cache directory, and
// holds no account data — only a timestamp.

const markerFile = new File(Paths.document, "nemu-welcome-completed-v1.json");

export async function readMobileWelcomeDeviceCompleted(): Promise<boolean> {
  return markerFile.exists;
}

export async function markMobileWelcomeDeviceCompleted(): Promise<void> {
  if (markerFile.exists) return;
  await markerFile.write(JSON.stringify({ completedAt: Date.now() }));
}

export async function clearMobileWelcomeDeviceCompleted(): Promise<void> {
  if (markerFile.exists) markerFile.delete();
}
