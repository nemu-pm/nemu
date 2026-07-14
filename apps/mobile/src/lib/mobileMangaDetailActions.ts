export type MobileMangaDetailActionState = {
  openingReader: boolean;
  savingMetadata: boolean;
  removing: boolean;
};

export type MobileMangaDetailMutationResultAction =
  | "close-confirmation"
  | "keep-confirmation-open";

export function isMobileMangaDetailActionBusy(
  state: MobileMangaDetailActionState,
): boolean {
  return state.openingReader || state.savingMetadata || state.removing;
}

export function canStartMobileMangaDetailAction(
  state: MobileMangaDetailActionState,
): boolean {
  return !isMobileMangaDetailActionBusy(state);
}

export function canOpenMobileMangaDetailReader({
  hasSource,
  hasChapter,
  state,
}: {
  hasSource: boolean;
  hasChapter: boolean;
  state: MobileMangaDetailActionState;
}): boolean {
  return hasSource && hasChapter && canStartMobileMangaDetailAction(state);
}

export function shouldRenderMobileMangaDetailSkeleton({
  loading,
  hasEntry,
}: {
  loading: boolean;
  hasEntry: boolean;
}): boolean {
  return loading && !hasEntry;
}

export function shouldShowMobileMangaDetailLoadError({
  loading,
  hasError,
}: {
  loading: boolean;
  hasError: boolean;
}): boolean {
  return !loading && hasError;
}

export function getMobileMangaDetailMutationResultAction({
  succeeded,
}: {
  succeeded: boolean;
}): MobileMangaDetailMutationResultAction {
  return succeeded ? "close-confirmation" : "keep-confirmation-open";
}
