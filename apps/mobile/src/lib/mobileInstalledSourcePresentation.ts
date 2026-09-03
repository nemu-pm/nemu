import type { InstalledSource } from "@/data/schema";
import { getMobileInstalledSourceRegistryRef } from "./mobileInstalledSourceKeys";

/**
 * Display strings for an installed source, single-sourced so the Settings list,
 * the source settings sheet, and the Browse quick-action sheet cannot drift.
 */
export function getMobileInstalledSourceName(source: InstalledSource): string {
  const { sourceId } = getMobileInstalledSourceRegistryRef(source);
  return source.name ?? source.packageMetadata?.name ?? sourceId;
}

export function getMobileInstalledSourceRegistryLabel(
  source: InstalledSource,
): string {
  return getMobileInstalledSourceRegistryRef(source).registryId;
}

export function getMobileInstalledSourceSubtitle(
  source: InstalledSource,
): string {
  const languages = source.languages?.length
    ? source.languages.join(", ").toUpperCase()
    : source.packageMetadata?.languages?.join(", ").toUpperCase();
  return [languages, getMobileInstalledSourceRegistryLabel(source)]
    .filter(Boolean)
    .join(" / ");
}
