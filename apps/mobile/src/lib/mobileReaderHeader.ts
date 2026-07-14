import { getEntryTitle, type LibraryEntry } from "@/data/schema";

export function getMobileReaderTitle(
  entry: LibraryEntry | null | undefined,
  mangaId: string,
  sourceTitle?: string | null,
  fallbackTitle?: string | null,
): string {
  const libraryTitle = entry ? getEntryTitle(entry).trim() : "";
  if (libraryTitle && libraryTitle !== mangaId) return libraryTitle;
  const resolvedSourceTitle = sourceTitle?.trim() ?? "";
  if (resolvedSourceTitle && resolvedSourceTitle !== mangaId) {
    return resolvedSourceTitle;
  }
  const resolvedFallbackTitle = fallbackTitle?.trim() ?? "";
  if (resolvedFallbackTitle && resolvedFallbackTitle !== mangaId) {
    return resolvedFallbackTitle;
  }
  return mangaId;
}
