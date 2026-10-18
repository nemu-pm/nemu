import { File, Paths } from "expo-file-system";

// Recent searches: one small JSON file per profile in the document directory
// (removed with the app, not purged under storage pressure like the cache
// directory; the same choice as the welcome-completion marker). No SQLite
// migration and no synced setting — the list is a device-local convenience.

function recentsFile(key: string): File {
  return new File(Paths.document, `nemu-search-recents-v1-${key}.json`);
}

export async function readMobileSearchRecentsText(key: string): Promise<string | null> {
  const file = recentsFile(key);
  if (!file.exists) return null;
  return file.text();
}

export async function writeMobileSearchRecentsText(key: string, text: string): Promise<void> {
  await recentsFile(key).write(text);
}
