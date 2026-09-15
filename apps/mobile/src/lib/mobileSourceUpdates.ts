import type { InstalledSource } from "@/data/schema";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";
import { isMobileInstalledSourceDisabled } from "@/sources/mobileSourceRuntime";
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
    // A disabled source is not run, so it is not auto-updated either: a broken
    // source stays pinned at its installed version until the user re-enables it.
    installedSources
      .filter(
        (source) => !source.removed && !isMobileInstalledSourceDisabled(source),
      )
      .flatMap((source) =>
        getMobileInstalledSourceRegistryKeys(source).map((key) => [key, source] as const),
      ),
  );

  return availableSources.filter((source) => {
    const installed = installedByKey.get(makeSourceKey(source.registryId, source.id));
    return installed != null && source.version > installed.version;
  });
}
