export type MobileSourceMangaLibraryActionState = {
  adding: boolean;
  removing: boolean;
  inLibrary: boolean;
  detailReady: boolean;
};

export type MobileSourceMangaLibraryPressState = MobileSourceMangaLibraryActionState & {
  openingReader: boolean;
};

export type MobileSourceMangaReaderActionState = {
  openingReader: boolean;
  adding: boolean;
  removing: boolean;
};

export type MobileSourceMangaMutationResultAction =
  | "close-confirmation"
  | "keep-confirmation-open";

export function canRunMobileSourceMangaLibraryAction(
  state: MobileSourceMangaLibraryActionState,
): boolean {
  if (state.adding || state.removing) return false;
  return state.inLibrary || state.detailReady;
}

export function canPressMobileSourceMangaLibraryAction(
  state: MobileSourceMangaLibraryPressState,
): boolean {
  return !state.openingReader && canRunMobileSourceMangaLibraryAction(state);
}

export function isMobileSourceMangaLibraryActionBusy(
  state: Pick<MobileSourceMangaLibraryActionState, "adding" | "removing">,
): boolean {
  return state.adding || state.removing;
}

export function isMobileSourceMangaReaderActionBusy(
  state: MobileSourceMangaReaderActionState,
): boolean {
  return state.openingReader || state.adding || state.removing;
}

export function canOpenMobileSourceMangaReader({
  hasChapter,
  state,
}: {
  hasChapter: boolean;
  state: MobileSourceMangaReaderActionState;
}): boolean {
  return hasChapter && !isMobileSourceMangaReaderActionBusy(state);
}

export function shouldRenderMobileSourceMangaReaderAction({
  hasChapter,
}: {
  hasChapter: boolean;
}): boolean {
  return hasChapter;
}

export function shouldRenderMobileSourceMangaSkeleton({
  loading,
  hasMetadata,
}: {
  loading: boolean;
  hasMetadata: boolean;
}): boolean {
  return loading && !hasMetadata;
}

export function shouldShowMobileSourceMangaDetailLoadError({
  status,
  hasMetadata,
}: {
  status: "idle" | "loading" | "ready" | "blocked" | "error";
  hasMetadata: boolean;
}): boolean {
  return (status === "blocked" || status === "error") && !hasMetadata;
}

export function getMobileSourceMangaMutationResultAction({
  succeeded,
}: {
  succeeded: boolean;
}): MobileSourceMangaMutationResultAction {
  return succeeded ? "close-confirmation" : "keep-confirmation-open";
}
