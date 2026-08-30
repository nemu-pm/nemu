import {
  getActiveMobileSourceProfileScope,
  makeMobileSourceExecutionKey,
} from "./mobileSourceProfileScope";

function profilePrefix(profileScope: string): string {
  const normalized = profileScope.trim();
  if (!normalized) throw new Error("A mobile source profile scope is required.");
  return `${normalized}::`;
}

/** Expo web has no native Aidoku settings store. Keep an identical surface. */
export async function clearMobileAidokuSandboxDataForProfile(
  profileScope = getActiveMobileSourceProfileScope(),
): Promise<void> {
  profilePrefix(profileScope);
}

export async function clearMobileAidokuSandboxDataForSource(
  canonicalSourceKey: string,
  profileScope = getActiveMobileSourceProfileScope(),
): Promise<void> {
  makeMobileSourceExecutionKey(canonicalSourceKey, profileScope);
}
