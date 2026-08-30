import type { InstalledSource } from "@/data/schema";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  getMobileInstalledSourceRegistryKey,
  getMobileInstalledSourceRegistryKeys,
} from "./mobileInstalledSourceKeys";

export function getInstalledSourceUpdateKey(source: InstalledSource): string {
  return getMobileInstalledSourceRegistryKey(source);
}

export function findMobileSourceUpdates(
  installedSources: InstalledSource[],
  availableSources: MobileRegistrySource[],
): MobileRegistrySource[] {
  const installedByKey = new Map(
    installedSources
      .filter((source) => !source.removed)
      .flatMap((source) =>
        getMobileInstalledSourceRegistryKeys(source).map((key) => [key, source] as const),
      ),
  );

  return availableSources.filter((source) => {
    const installed = installedByKey.get(makeSourceKey(source.registryId, source.id));
    return installed != null && source.version > installed.version;
  });
}
