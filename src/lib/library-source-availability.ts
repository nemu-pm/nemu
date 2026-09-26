import { Keys } from "@/data/keys";

/**
 * Whether a library item's source link can run on this device, and if not,
 * why. A synced library item can point at a source this browser never
 * installed (uninstalled on another device — its cloud record is a tombstone
 * that sync deliberately does not reinstall — or the item predates
 * installed-source sync). That used to read as "X is disabled. Enable it in
 * Settings", which sent people to a toggle that does not exist. Mirrors mobile's
 * `getMobileMissingSourceState`: a missing source offers a one-tap install from
 * the registry catalog when the catalog has it.
 */
export type LibrarySourceAvailability<TCatalogSource> =
  | { status: "enabled" }
  | { status: "disabled" }
  | { status: "not-installed"; candidate: TCatalogSource | null };

type SourceLinkRef = { registryId: string; sourceId: string };
type InstalledSourceRef = { id: string; removed?: boolean; disabled?: boolean };
type CatalogSourceRef = { id: string; registryId: string };

export function getLibrarySourceAvailability<TCatalogSource extends CatalogSourceRef>(
  link: SourceLinkRef,
  installedSources: readonly InstalledSourceRef[],
  catalog: readonly TCatalogSource[],
): LibrarySourceAvailability<TCatalogSource> {
  const key = Keys.source(link.registryId, link.sourceId);
  const installed = installedSources.find(
    (source) => source.id === key && source.removed !== true,
  );
  if (installed) {
    return installed.disabled === true
      ? { status: "disabled" }
      : { status: "enabled" };
  }
  const candidate =
    catalog.find(
      (source) =>
        source.registryId === link.registryId && source.id === link.sourceId,
    ) ?? null;
  return { status: "not-installed", candidate };
}
