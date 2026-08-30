export type MobileSourceManagerRequestCloseAction =
  | "ignore"
  | "close-confirmation"
  | "close-add-panel"
  | "close-sheet";

export type MobileSourceManagerMutationResultAction =
  | "close-confirmation"
  | "keep-confirmation-open";

export function getMobileSourceManagerRequestCloseAction({
  addPanelOpen,
  confirmationLoading,
  confirmationOpen,
}: {
  addPanelOpen: boolean;
  confirmationLoading: boolean;
  confirmationOpen: boolean;
}): MobileSourceManagerRequestCloseAction {
  if (confirmationOpen) {
    return confirmationLoading ? "ignore" : "close-confirmation";
  }
  if (addPanelOpen) return "close-add-panel";
  return "close-sheet";
}

export function getMobileSourceManagerMutationResultAction({
  succeeded,
}: {
  succeeded: boolean;
}): MobileSourceManagerMutationResultAction {
  return succeeded ? "close-confirmation" : "keep-confirmation-open";
}
