export async function removeMobileSourceAfterSettingsCleanup(input: {
  settingsKeys: readonly string[];
  resetSourceSettings: (settingsKey: string) => Promise<void>;
  removeInstalledSource: () => Promise<void>;
  clearSourceDetailCache?: () => Promise<void>;
}): Promise<void> {
  const settingsKeys = [...new Set(input.settingsKeys)];
  await Promise.all([
    ...settingsKeys.map((settingsKey) =>
      input.resetSourceSettings(settingsKey),
    ),
    // Cached source details are public catalog data: hygiene that must never
    // block or fail an uninstall, unlike the secure-settings scrub above.
    input.clearSourceDetailCache?.().catch(() => undefined),
  ]);
  // Keep the source visible and retryable until every credential/settings
  // alias has been scrubbed successfully.
  await input.removeInstalledSource();
}
