export type MobileCollectionMembershipRequestCloseAction =
  | "ignore"
  | "close-sheet";

export function getMobileCollectionMembershipRequestCloseAction({
  busy,
}: {
  busy: boolean;
}): MobileCollectionMembershipRequestCloseAction {
  return busy ? "ignore" : "close-sheet";
}
