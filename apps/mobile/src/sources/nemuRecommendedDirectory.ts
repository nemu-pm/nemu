import { NEMU_RECOMMENDED_REGISTRY } from "@nemu/core/sources";
import {
  parseAidokuRegistryIndex,
  type MobileRegistrySource,
} from "./aidokuRegistry";

/**
 * Bundled snapshot of the nemu recommended directory's `index.min.json`.
 *
 * It is what a first launch (or a launch offline, with no cached catalog) sees
 * until the live index loads, so the welcome list is never empty because of a
 * network blip. It is data, not code: every `downloadURL` points at the
 * published `.aix`, which is still downloaded and hash-checked at install time.
 * Regenerate it from the registry repo whenever the entry list changes.
 */
export const NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX = {
  name: "nemu recommended",
  // Mirrors the published index entry (including `contentLicense`).
  sources: [
    {
      id: "multi.peppercarrot",
      name: "Pepper&Carrot",
      version: 1,
      iconURL: "icons/multi.peppercarrot-v1.png",
      downloadURL: "sources/multi.peppercarrot-v1.aix",
      languages: ["en", "ja", "zh", "fr", "de", "es", "it", "pt", "ru", "ko"],
      contentRating: 0,
      contentLicense: "CC-BY-4.0",
    },
  ] as Array<Record<string, unknown>>,
};

export function getNemuRecommendedDirectoryFallbackSources(): MobileRegistrySource[] {
  return parseAidokuRegistryIndex(
    NEMU_RECOMMENDED_REGISTRY,
    NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX,
  ).sources.map((source) => ({
    ...source,
    registryName: NEMU_RECOMMENDED_REGISTRY.name,
  }));
}
