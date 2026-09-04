export type MobileMetadataEditorRequestCloseAction =
  | "ignore"
  | "close-sheet"
  | "confirm-discard";

export type MobileMetadataEditorSaveResultAction =
  | "close-sheet"
  | "keep-open";

/**
 * The editable fields the metadata sheet exposes. The discard confirmation
 * names the ones that actually changed, so the copy never claims more than the
 * draft holds.
 */
export type MobileMetadataEditorDirtyField =
  | "title"
  | "authors"
  | "description"
  | "tags"
  | "cover"
  | "status";

export type MobileMetadataEditorFormSnapshot = {
  title: string;
  authorsText: string;
  description: string;
  tagsText: string;
  coverUrl: string;
  status: number;
};

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

/**
 * Lists the changed fields in the order they appear in the editor, so the
 * discard copy reads the way the form does.
 */
export function getMobileMetadataEditorDirtyFields({
  form,
  initialForm,
  hasSelectedCoverAsset,
}: {
  form: MobileMetadataEditorFormSnapshot;
  initialForm: MobileMetadataEditorFormSnapshot;
  hasSelectedCoverAsset: boolean;
}): MobileMetadataEditorDirtyField[] {
  const fields: MobileMetadataEditorDirtyField[] = [];
  if (form.title !== initialForm.title) fields.push("title");
  if (form.authorsText !== initialForm.authorsText) fields.push("authors");
  if (form.description !== initialForm.description) fields.push("description");
  if (form.tagsText !== initialForm.tagsText) fields.push("tags");
  if (hasSelectedCoverAsset || form.coverUrl !== initialForm.coverUrl) {
    fields.push("cover");
  }
  if (form.status !== initialForm.status) fields.push("status");
  return fields;
}

/**
 * Android Back and the sheet's own swipe-down both resolve through this
 * policy: in-flight work wins, an untouched draft closes silently, and a dirty
 * draft asks before it is thrown away.
 */
export function getMobileMetadataEditorRequestCloseAction({
  busy,
  dirty,
}: {
  busy: boolean;
  dirty: boolean;
}): MobileMetadataEditorRequestCloseAction {
  if (busy) return "ignore";
  return dirty ? "confirm-discard" : "close-sheet";
}

export function getMobileMetadataEditorSaveResultAction({
  saved,
}: {
  saved: boolean;
}): MobileMetadataEditorSaveResultAction {
  return saved ? "close-sheet" : "keep-open";
}
