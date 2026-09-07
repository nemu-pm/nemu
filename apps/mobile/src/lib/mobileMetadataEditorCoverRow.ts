import type { MobileStrings } from "@/lib/mobileI18n";

/**
 * What the cover row's subtitle is describing.
 *
 * - `local-pick` — an image chosen from the photo library, still unsaved.
 * - `url` — whatever URL the cover currently resolves through, which is the
 *   source's own cover until an override replaces it.
 * - `empty` — no cover at all, so the row shows the section's instruction
 *   instead of a state.
 */
export type MobileMetadataCoverRowState = "local-pick" | "url" | "empty";

export function getMobileMetadataCoverRowState({
  hasSelectedCoverAsset,
  coverUrl,
}: {
  hasSelectedCoverAsset: boolean;
  coverUrl: string;
}): MobileMetadataCoverRowState {
  if (hasSelectedCoverAsset) return "local-pick";
  return coverUrl.trim().length ? "url" : "empty";
}

/**
 * The cover row's second line. A picked image announces that it uploads on
 * save; anything else shows the URL the cover comes from, which is the one
 * state description available without new copy (the row's clear action and the
 * cover URL field's own reset are what mark it as an override).
 */
export function getMobileMetadataCoverRowSubtitle({
  hasSelectedCoverAsset,
  coverUrl,
  strings,
}: {
  hasSelectedCoverAsset: boolean;
  coverUrl: string;
  strings: MobileStrings;
}): string | undefined {
  switch (getMobileMetadataCoverRowState({ hasSelectedCoverAsset, coverUrl })) {
    case "local-pick":
      return strings.metadataEditor.coverSelected;
    case "url":
      return coverUrl.trim();
    case "empty":
      return undefined;
  }
}
