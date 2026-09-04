import type { InstalledSource } from "@/data/schema";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";
import { getMobileImageUriPolicy } from "./mobileImageUriPolicy";
import { getMobileInstalledSourceRegistryKeys } from "./mobileInstalledSourceKeys";

type MobileSourceIconRegistryEntry = Pick<
  MobileRegistrySource,
  "id" | "registryId" | "icon"
>;

/**
 * A source icon is third-party data. Only the URIs React Native's image loader
 * is allowed to fetch for source-owned artwork survive; everything else falls
 * through to the next link in the chain so the caller can render the globe
 * placeholder instead of mounting an image that can only fail.
 */
export function normalizeMobileSourceIconUri(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return getMobileImageUriPolicy(trimmed, "source").allowed ? trimmed : null;
}

export function buildMobileSourceIconIndex(
  registrySources: readonly MobileSourceIconRegistryEntry[] | null | undefined,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const source of registrySources ?? []) {
    const icon = normalizeMobileSourceIconUri(source.icon);
    if (!icon) continue;
    index.set(makeSourceKey(source.registryId, source.id), icon);
  }
  return index;
}

/**
 * Fallback chain for an installed source's artwork:
 * installed record → registry catalog entry for the same key → none.
 *
 * The installed record is written with the catalog icon at install/update time,
 * but records that arrive through cloud sync (or from a catalog entry that had
 * no icon then) can still be missing one. Browse has always recovered through
 * the catalog join; this is the same join, single-sourced so every surface that
 * renders an installed source agrees.
 *
 * `packageMetadata` is deliberately not consulted: `SourcePackageMetadata` has
 * no icon field, the `.aix` package does not expose one, and inventing one here
 * would silently disagree with the persisted record.
 */
export function resolveMobileInstalledSourceIconUri(
  source: InstalledSource,
  registryIcons?:
    | Map<string, string>
    | readonly MobileSourceIconRegistryEntry[]
    | null,
): string | null {
  const direct = normalizeMobileSourceIconUri(source.icon);
  if (direct) return direct;

  const index =
    registryIcons instanceof Map
      ? registryIcons
      : buildMobileSourceIconIndex(registryIcons);
  if (index.size === 0) return null;

  for (const key of getMobileInstalledSourceRegistryKeys(source)) {
    const icon = index.get(key);
    if (icon) return icon;
  }

  return null;
}
