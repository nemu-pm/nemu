import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import {
  getActiveMobileSourceProfileScope,
  makeMobileSourceExecutionKey,
} from "./mobileSourceProfileScope";

function profilePrefix(profileScope: string): string {
  const normalized = profileScope.trim();
  if (!normalized) throw new Error("A mobile source profile scope is required.");
  return `${normalized}::`;
}

export async function clearMobileAidokuSandboxDataForProfile(
  profileScope = getActiveMobileSourceProfileScope(),
): Promise<void> {
  await NemuAidokuModule.clearAidokuSandboxSettings(
    profilePrefix(profileScope),
    true,
  );
}

export async function clearMobileAidokuSandboxDataForSource(
  canonicalSourceKey: string,
  profileScope = getActiveMobileSourceProfileScope(),
): Promise<void> {
  await NemuAidokuModule.clearAidokuSandboxSettings(
    makeMobileSourceExecutionKey(canonicalSourceKey, profileScope),
    false,
  );
}
