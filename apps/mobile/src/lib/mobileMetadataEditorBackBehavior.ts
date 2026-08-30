export type MobileMetadataEditorRequestCloseAction =
  | "ignore"
  | "close-sheet";

export type MobileMetadataEditorSaveResultAction =
  | "close-sheet"
  | "keep-open";

export type MobileMetadataEditorActionState = {
  saving: boolean;
  searchingMatches: boolean;
  applyingMatch: boolean;
  fetchingSource: boolean;
  pickingCover: boolean;
  uploadingCover: boolean;
};

export function isMobileMetadataEditorActionBusy(
  state: MobileMetadataEditorActionState
): boolean {
  return (
    state.saving ||
    state.searchingMatches ||
    state.applyingMatch ||
    state.fetchingSource ||
    state.pickingCover ||
    state.uploadingCover
  );
}

export function canStartMobileMetadataEditorAction(
  state: MobileMetadataEditorActionState
): boolean {
  return !isMobileMetadataEditorActionBusy(state);
}

export function canSaveMobileMetadataEditorForm({
  dirty,
  title,
  state,
}: {
  dirty: boolean;
  title: string;
  state: MobileMetadataEditorActionState;
}): boolean {
  return dirty && title.trim().length > 0 && canStartMobileMetadataEditorAction(state);
}

export function canSelectMobileMetadataStatusOption({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}

export function getMobileMetadataEditorRequestCloseAction({
  busy,
}: {
  busy: boolean;
}): MobileMetadataEditorRequestCloseAction {
  return busy ? "ignore" : "close-sheet";
}

export function getMobileMetadataEditorSaveResultAction({
  saved,
}: {
  saved: boolean;
}): MobileMetadataEditorSaveResultAction {
  return saved ? "close-sheet" : "keep-open";
}
