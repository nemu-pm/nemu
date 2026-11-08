import { NEMU_RECOMMENDED_REGISTRY } from "@nemu/core/sources";
import {
  parseAidokuRegistryIndex,
  type MobileRegistrySource,
} from "./aidokuRegistry";

/**
 * Bundled snapshot of the built-in example directory's `index.min.json`.
 *
 * It is what a first launch (or a launch offline, with no cached catalog) sees
 * until the live index loads, so the welcome list is never empty because of a
 * network blip. It is data, not code: every `downloadURL` points at the
 * published `.aix`, which is still downloaded and hash-checked at install time.
 * Regenerate it from the registry repo whenever the entry list changes.
 */
export const NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX = {
  name: "nemu example sources",
  // Mirrors the published index, entry for entry and in its order; onboarding pins
  // its own order (see MOBILE_WELCOME_SOURCE_ORDER).
  sources: [
    {
      id: "en.littlenemo",
      name: "Little Nemo in Slumberland",
      version: 1,
      iconURL: "icons/en.littlenemo-v1.png",
      downloadURL: "sources/en.littlenemo-v1.aix",
      languages: ["en"],
      contentRating: 0,
      baseURL: "https://commons.wikimedia.org/wiki/Category:Little_Nemo_in_Slumberland",
      contentLicense: "Public-Domain",
    },
    {
      id: "ja.ndlpublicdomain",
      name: "NDL Public Domain Picks",
      version: 1,
      iconURL: "icons/ja.ndlpublicdomain-v1.png",
      downloadURL: "sources/ja.ndlpublicdomain-v1.aix",
      languages: ["ja"],
      contentRating: 0,
      baseURL: "https://dl.ndl.go.jp",
      contentLicense: "Public-Domain",
    },
    {
      // No content of its own: it reads the user's own LANraragi server, so no
      // `contentLicense`. Not an onboarding pick (see getMobileWelcomeAvailableSources).
      id: "multi.lanraragi",
      name: "LANraragi",
      version: 4,
      iconURL: "icons/multi.lanraragi-v4.png",
      downloadURL: "sources/multi.lanraragi-v4.aix",
      languages: ["multi"],
      contentRating: 1,
      baseURL: "https://github.com/Difegue/LANraragi",
      minAppVersion: "0.7.1",
    },
    {
      id: "multi.minifantasytheater",
      name: "Mini Fantasy Theater",
      version: 2,
      iconURL: "icons/multi.minifantasytheater-v2.png",
      downloadURL: "sources/multi.minifantasytheater-v2.aix",
      languages: ["en", "ja", "fr", "es", "de", "ca", "nn", "sl", "tok"],
      contentRating: 0,
      baseURL: "https://www.peppercarrot.com/en/webcomics/miniFantasyTheater.html",
      minAppVersion: "0.7.1",
      contentLicense: "CC-BY-SA-4.0",
      contentLicenseNote: "AI derivation prohibited",
    },
    {
      id: "multi.peppercarrot",
      name: "Pepper&Carrot",
      version: 1,
      iconURL: "icons/multi.peppercarrot-v1.png",
      downloadURL: "sources/multi.peppercarrot-v1.aix",
      languages: ["en", "ja", "zh", "fr", "de", "es", "it", "pt", "ru", "ko"],
      contentRating: 0,
      baseURL: "https://www.peppercarrot.com",
      contentLicense: "CC-BY-4.0",
      contentLicenseNote: "AI derivation prohibited",
    },
  ] as Array<Record<string, unknown>>,
};

/** A built-in source's content licence from the bundled snapshot, if it declares one. */
export function getNemuRecommendedSourceContentLicense(sourceId: string): string | undefined {
  const entry = NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX.sources.find((source) => source.id === sourceId);
  return typeof entry?.contentLicense === "string" ? entry.contentLicense : undefined;
}

export function getNemuRecommendedDirectoryFallbackSources(): MobileRegistrySource[] {
  return parseAidokuRegistryIndex(
    NEMU_RECOMMENDED_REGISTRY,
    NEMU_RECOMMENDED_DIRECTORY_FALLBACK_INDEX,
  ).sources.map((source) => ({
    ...source,
    registryName: NEMU_RECOMMENDED_REGISTRY.name,
  }));
}
