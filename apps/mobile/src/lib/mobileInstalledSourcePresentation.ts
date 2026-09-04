import type { InstalledSource } from "@/data/schema";
import { getMobileInstalledSourceRegistryRef } from "./mobileInstalledSourceKeys";

/** How many entries to list before collapsing the rest into "+N". */
const MAX_LISTED_LABELS = 2;

/**
 * Display strings for an installed source, single-sourced so the Settings list,
 * the source settings sheet, and the Browse quick-action sheet cannot drift.
 */
export function getMobileInstalledSourceName(source: InstalledSource): string {
  const { sourceId } = getMobileInstalledSourceRegistryRef(source);
  return source.name ?? source.packageMetadata?.name ?? sourceId;
}

/**
 * "EN" / "EN, JA" — and "Safe" / "Safe, Suggestive" — stay as-is; longer lists
 * collapse to their first two entries plus a "+N" suffix so a subtitle or a
 * picker summary never wraps to a second line. `upper` uppercases the entries,
 * which is what language codes want and what free-form labels do not.
 */
export function compactMobileLabelList(
  labels: string[],
  options: { upper?: boolean } = {},
): string | undefined {
  if (!labels.length) return undefined;
  const entries = options.upper
    ? labels.map((label) => label.toUpperCase())
    : labels;
  if (entries.length <= MAX_LISTED_LABELS) {
    return entries.join(", ");
  }
  return `${entries.slice(0, MAX_LISTED_LABELS).join(", ")} +${
    entries.length - MAX_LISTED_LABELS
  }`;
}

function installedSourceLanguages(source: InstalledSource): string[] {
  return source.languages?.length
    ? source.languages
    : (source.packageMetadata?.languages ?? []);
}

export function getMobileInstalledSourceSubtitle(
  source: InstalledSource,
): string {
  const languages = compactMobileLabelList(installedSourceLanguages(source), {
    upper: true,
  });
  return [languages, getMobileInstalledSourceRegistryRef(source).registryId]
    .filter(Boolean)
    .join(" / ");
}
