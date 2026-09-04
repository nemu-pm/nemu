export type MobileCollectionMembershipRequestCloseAction =
  | "ignore"
  | "close-sheet"
  | "confirm-discard";

/**
 * The unsaved drafts the membership sheet can hold. Membership toggles are not
 * listed here: they are saved from the sheet's own footer action, while these
 * two live in text fields that a dismissal would silently drop.
 */
export type MobileCollectionMembershipDraftField = "newCollection" | "rename";

export function getMobileCollectionMembershipDraftFields({
  newCollectionName,
  renameDraft,
  renameTargetName,
}: {
  newCollectionName: string;
  renameDraft: string;
  renameTargetName: string | null;
}): MobileCollectionMembershipDraftField[] {
  const fields: MobileCollectionMembershipDraftField[] = [];
  if (newCollectionName.trim().length > 0) fields.push("newCollection");
  const trimmedRename = renameDraft.trim();
  if (
    renameTargetName !== null &&
    trimmedRename.length > 0 &&
    trimmedRename !== renameTargetName.trim()
  ) {
    fields.push("rename");
  }
  return fields;
}

/**
 * Android Back and the sheet's own swipe-down both resolve through this
 * policy: in-flight collection work wins, an empty draft closes silently, and
 * a typed-but-unsaved draft asks before it is thrown away.
 */
export function getMobileCollectionMembershipRequestCloseAction({
  busy,
  dirty,
}: {
  busy: boolean;
  dirty: boolean;
}): MobileCollectionMembershipRequestCloseAction {
  if (busy) return "ignore";
  return dirty ? "confirm-discard" : "close-sheet";
}
