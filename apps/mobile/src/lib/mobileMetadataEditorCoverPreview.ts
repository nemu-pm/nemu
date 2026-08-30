import type { InstalledSource } from "@/data/schema";

export type MobileMetadataEditorCoverSourceChoice = {
  id: string;
  installedSource?: InstalledSource;
};

type ResolveMobileMetadataEditorCoverSourceInput = {
  coverPreview: string;
  hasSelectedCoverAsset: boolean;
  coverPreviewSourceId: string | null;
  sourceChoices: MobileMetadataEditorCoverSourceChoice[];
  coverSource?: InstalledSource | null;
  initialCoverUrl: string;
  baseCoverUrl: string;
};

export function resolveMobileMetadataEditorCoverSource({
  coverPreview,
  hasSelectedCoverAsset,
  coverPreviewSourceId,
  sourceChoices,
  coverSource = null,
  initialCoverUrl,
  baseCoverUrl,
}: ResolveMobileMetadataEditorCoverSourceInput): InstalledSource | null {
  const previewUrl = coverPreview.trim();
  if (hasSelectedCoverAsset || !previewUrl) return null;

  if (coverPreviewSourceId) {
    return (
      sourceChoices.find((choice) => choice.id === coverPreviewSourceId)?.installedSource ??
      null
    );
  }

  return previewUrl === initialCoverUrl.trim() || previewUrl === baseCoverUrl.trim()
    ? coverSource
    : null;
}
