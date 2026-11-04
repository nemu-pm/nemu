import { NEMU_RECOMMENDED_REGISTRY_ID } from "@nemu/core/sources";
import type { AppLanguage, InstalledSource } from "@/data/schema";
import { formatMobileContentLicense } from "@/lib/mobileBrowseSources";
import type { MobileStrings } from "@/lib/mobileI18n";
import { formatMobileLanguageDisplayName, normalizeMobileLanguageCode } from "@/lib/mobileLanguageSettings";
import { getNemuRecommendedDirectoryFallbackSources } from "@/sources/nemuRecommendedDirectory";

/** Past this many the 作品信息 sheet's language row would be a wall of names. */
const MAX_LANGUAGES = 6;

/**
 * The languages a title is read in, by name: those its chapters are in (a
 * multi-language source lists the reader's picks), or else the ones its
 * source declares. The "multi" bucket names no language and is left out.
 */
export function getMobileDetailLanguageNames(
  chapters: readonly { lang?: string | null }[],
  source: Pick<InstalledSource, "languages"> | null | undefined,
  appLanguage: AppLanguage,
  strings: MobileStrings,
): string[] {
  const codes = (list: readonly (string | null | undefined)[]) =>
    [...new Set(list.filter((code): code is string => Boolean(code?.trim())).map(normalizeMobileLanguageCode))].filter(
      (code) => code !== "multi",
    );
  const fromChapters = codes(chapters.map((chapter) => chapter.lang));
  const picked = fromChapters.length ? fromChapters : codes(source?.languages ?? []);
  return picked.slice(0, MAX_LANGUAGES).map((code) =>
    formatMobileLanguageDisplayName(code, appLanguage, { other: strings.browse.otherLanguages }),
  );
}

/**
 * A nemu-recommended source's content licence ("CC BY 4.0"), from the
 * bundled directory snapshot (an installed source does not carry it); null
 * for every other source.
 */
export function getMobileDetailSourceLicense(
  source: Pick<InstalledSource, "registryId" | "sourceId" | "id"> | null | undefined,
): string | null {
  if (!source || source.registryId !== NEMU_RECOMMENDED_REGISTRY_ID) return null;
  const sourceId = source.sourceId ?? source.id.split(":").pop();
  const entry = getNemuRecommendedDirectoryFallbackSources().find((candidate) => candidate.id === sourceId);
  return entry?.contentLicense ? formatMobileContentLicense(entry.contentLicense) : null;
}
