export async function removeMobileSourceAfterSettingsCleanup(input: {
  settingsKeys: readonly string[];
  resetSourceSettings: (settingsKey: string) => Promise<void>;
  removeInstalledSource: () => Promise<void>;
}): Promise<void> {
  const settingsKeys = [...new Set(input.settingsKeys)];
  await Promise.all(
    settingsKeys.map((settingsKey) =>
      input.resetSourceSettings(settingsKey),
    ),
  );
  // Keep the source visible and retryable until every credential/settings
  // alias has been scrubbed successfully.
  await input.removeInstalledSource();
}
