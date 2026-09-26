import type { InstalledSource, LocalSourceLink } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import { mobileInstalledSourceMatchesLink } from "./mobileInstalledSourceKeys";
import { getMobileSourceRouteParamCandidates } from "./mobileSourceRoutes";

/**
 * A synced library item can reference a source this device has no install row
 * for: the source was uninstalled on another device (its cloud record is a
 * tombstone, so account sync deliberately does not reinstall it), or the item
 * predates installed-source sync. The detail screen used to report that as
 * "the installed source package is unavailable" with no way forward. This
 * resolves the registry entry the link points at so the screen can offer a
 * one-tap install instead; installing goes through the normal installer, which
 * records the source on the account again.
 */
export type MobileMissingSourceState =
  | { status: "installed" }
  /** Not installed and the catalog has no runnable entry for it (yet). */
  | { status: "missing"; candidate: null }
  | { status: "missing"; candidate: MobileRegistrySource };

export function findMobileRegistrySourceForLink(
  link: Pick<LocalSourceLink, "registryId" | "sourceId">,
  catalog: readonly MobileRegistrySource[],
): MobileRegistrySource | null {
  const sourceIds = new Set(getMobileSourceRouteParamCandidates(link.sourceId));
  return (
    catalog.find(
      (source) =>
        source.registryId === link.registryId &&
        sourceIds.has(source.id) &&
        // Mobile ships no Tachiyomi executor; never offer an install it
        // cannot run.
        source.sourceKind !== "tachiyomi" &&
        Boolean(source.downloadUrl),
    ) ?? null
  );
}

export function getMobileMissingSourceState(
  link: Pick<LocalSourceLink, "registryId" | "sourceId"> | null | undefined,
  installedSources: readonly InstalledSource[],
  catalog: readonly MobileRegistrySource[],
): MobileMissingSourceState | null {
  if (!link) return null;
  if (
    installedSources.some(
      (source) => !source.removed && mobileInstalledSourceMatchesLink(source, link),
    )
  ) {
    return { status: "installed" };
  }
  const candidate = findMobileRegistrySourceForLink(link, catalog);
  return candidate
    ? { status: "missing", candidate }
    : { status: "missing", candidate: null };
}
