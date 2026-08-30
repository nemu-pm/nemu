import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";

export async function clearMobileReaderImageMemoryCache(): Promise<void> {
  try {
    await NemuAidokuModule.clearImageMemoryCache();
  } catch {
    // Memory cleanup is best-effort and must never block reader navigation.
  }
}
