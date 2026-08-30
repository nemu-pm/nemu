import { matchUserDataDatabaseProfile } from "./indexeddb";
import {
  matchSourceSettingsDatabaseProfile,
} from "@/stores/source-settings";
import {
  ProfileWriteFence,
  type ProfileWriteFenceLease,
} from "./profile-write-fence";

export type DeviceDataProfileId = string | undefined;

function normalizeProfileId(profileId?: string): DeviceDataProfileId {
  return profileId || undefined;
}

/**
 * Resolve every profile whose durable stores are included in a device-data
 * wipe. The active profile is always included because some browsers do not
 * implement `indexedDB.databases()` and therefore cannot enumerate it.
 */
export function discoverDeviceDataProfiles(
  databaseNames: Iterable<string>,
  activeProfileId?: string,
): DeviceDataProfileId[] {
  const profiles = new Set<DeviceDataProfileId>([
    normalizeProfileId(activeProfileId),
  ]);

  for (const databaseName of databaseNames) {
    const userData = matchUserDataDatabaseProfile(databaseName);
    const sourceSettings = matchSourceSettingsDatabaseProfile(databaseName);
    if (userData) profiles.add(normalizeProfileId(userData.profileId));
    if (sourceSettings) {
      profiles.add(normalizeProfileId(sourceSettings.profileId));
    }
  }

  // `Array.prototype.sort` always moves literal `undefined` entries to the
  // end without invoking the comparator. Wrap values so local-profile order
  // remains deterministic across engines and test/runtime implementations.
  return [...profiles]
    .map((profileId) => ({ profileId }))
    .sort((left, right) =>
      (left.profileId ?? "").localeCompare(right.profileId ?? ""),
    )
    .map(({ profileId }) => profileId);
}

/**
 * Retire each discovered profile only after its caller-supplied clear commits.
 *
 * The callback must clear every profile-scoped persistence backend while using
 * the supplied lease. Once it resolves, old tabs/stores permanently fail their
 * next write instead of recreating data after the device wipe.
 */
export async function retireDeviceDataProfiles(
  databaseNames: Iterable<string>,
  activeProfileId: string | undefined,
  clearProfile: (
    profileId: DeviceDataProfileId,
    lease: ProfileWriteFenceLease,
  ) => Promise<void>,
): Promise<DeviceDataProfileId[]> {
  const profiles = discoverDeviceDataProfiles(databaseNames, activeProfileId);
  for (const profileId of profiles) {
    await new ProfileWriteFence(profileId).retire((lease) =>
      clearProfile(profileId, lease),
    );
  }
  return profiles;
}
