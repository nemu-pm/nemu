import type { LibraryEntry, LocalCollection, LocalCollectionItem } from "@/data/schema";

export function sortCollections(collections: LocalCollection[]): LocalCollection[] {
  return [...collections].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return a.collectionId.localeCompare(b.collectionId);
  });
}

export function buildCollectionMembership(
  collectionItems: LocalCollectionItem[]
): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>();

  for (const item of collectionItems) {
    if (item.removed) continue;
    const ids = membership.get(item.collectionId) ?? new Set<string>();
    ids.add(item.libraryItemId);
    membership.set(item.collectionId, ids);
  }

  return membership;
}

export function buildRenamedCollection(
  collection: LocalCollection,
  name: string,
  updatedAt: number
): LocalCollection | null {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName === collection.name) return null;

  return {
    ...collection,
    name: trimmedName,
    updatedAt,
  };
}

export function entriesForCollection(
  entries: LibraryEntry[],
  collectionId: string | null,
  membership: Map<string, Set<string>>
): LibraryEntry[] {
  if (!collectionId) return entries;
  const ids = membership.get(collectionId) ?? new Set<string>();
  return entries.filter((entry) => ids.has(entry.item.libraryItemId));
}

export function collectionCount(
  collectionId: string,
  membership: Map<string, Set<string>>
): number {
  return membership.get(collectionId)?.size ?? 0;
}

export function resolveCollectionSelection(
  collections: LocalCollection[],
  selectedCollectionId: string | null
): {
  collection: LocalCollection | null;
  effectiveCollectionId: string | null;
  missing: boolean;
} {
  if (!selectedCollectionId) {
    return {
      collection: null,
      effectiveCollectionId: null,
      missing: false,
    };
  }

  const collection =
    collections.find((item) => item.collectionId === selectedCollectionId) ??
    null;

  return {
    collection,
    effectiveCollectionId: collection?.collectionId ?? null,
    missing: collection === null,
  };
}

export function collectionManagementTarget(
  collections: LocalCollection[],
  selectedCollectionId: string | null
): LocalCollection | null {
  if (selectedCollectionId) {
    const selected = collections.find(
      (collection) => collection.collectionId === selectedCollectionId
    );
    if (selected) return selected;
  }

  return collections[0] ?? null;
}

export type MobileCollectionActionState = {
  creating: boolean;
  loadingCollections?: boolean;
  renaming: boolean;
  savingMembership: boolean;
  removing: boolean;
};

export type MobileCollectionCreatePressAction =
  | { action: "ignore" }
  | { action: "open-panel"; preserveCurrentRoute: boolean };

export type MobileCollectionMembershipSaveResultAction =
  | "close-sheet"
  | "keep-sheet-open";

export function isMobileCollectionActionBusy(
  state: MobileCollectionActionState
): boolean {
  return (
    state.creating ||
    state.loadingCollections === true ||
    state.renaming ||
    state.savingMembership ||
    state.removing
  );
}

export function canStartMobileCollectionAction(
  state: MobileCollectionActionState
): boolean {
  return !isMobileCollectionActionBusy(state);
}

export function getMobileCollectionMembershipSaveResultAction({
  saved,
}: {
  saved: boolean;
}): MobileCollectionMembershipSaveResultAction {
  return saved ? "close-sheet" : "keep-sheet-open";
}

export function canSelectMobileCollectionScope({
  currentCollectionId,
  nextCollectionId,
  state,
}: {
  currentCollectionId: string | null;
  nextCollectionId: string | null;
  state: MobileCollectionActionState;
}): boolean {
  return (
    canStartMobileCollectionAction(state) &&
    currentCollectionId !== nextCollectionId
  );
}

export function canCreateMobileCollection(
  state: MobileCollectionActionState,
  name: string
): boolean {
  return canStartMobileCollectionAction(state) && name.trim().length > 0;
}

export function resolveMobileCollectionCreatePressAction({
  state,
  isCollectionRoute,
}: {
  state: MobileCollectionActionState;
  isCollectionRoute: boolean;
}): MobileCollectionCreatePressAction {
  if (!canStartMobileCollectionAction(state)) return { action: "ignore" };

  return {
    action: "open-panel",
    preserveCurrentRoute: isCollectionRoute,
  };
}

export function canRenameMobileCollection(
  state: MobileCollectionActionState,
  draftName: string,
  currentName: string
): boolean {
  const nextName = draftName.trim();
  return (
    canStartMobileCollectionAction(state) &&
    nextName.length > 0 &&
    nextName !== currentName
  );
}

export function canSaveMobileCollectionMembership(
  state: MobileCollectionActionState,
  changeCount: number
): boolean {
  return canStartMobileCollectionAction(state) && changeCount > 0;
}

export function canRetryMobileCollectionMembershipLoadError({
  hasError,
  state,
}: {
  hasError: boolean;
  state: MobileCollectionActionState;
}): boolean {
  return hasError && canStartMobileCollectionAction(state);
}

export function getMobileCollectionSelectionSessionKey({
  visible,
  targetId,
}: {
  visible: boolean;
  targetId: string;
}): string {
  return visible ? `open:${targetId}` : "closed";
}

export function collectionSelectionForLibraryItem(
  collections: LocalCollection[],
  membership: Map<string, Set<string>>,
  libraryItemId: string
): Set<string> {
  const selected = new Set<string>();

  for (const collection of collections) {
    if (membership.get(collection.collectionId)?.has(libraryItemId)) {
      selected.add(collection.collectionId);
    }
  }

  return selected;
}

export function toggleCollectionSelection(
  selected: Set<string>,
  collectionId: string
): Set<string> {
  const next = new Set(selected);
  if (next.has(collectionId)) {
    next.delete(collectionId);
  } else {
    next.add(collectionId);
  }
  return next;
}

export function diffCollectionSelection(
  initialSelected: Set<string>,
  selected: Set<string>,
  validCollectionIds: Set<string>
): { idsToAdd: string[]; idsToRemove: string[] } {
  const idsToAdd = [...selected].filter(
    (collectionId) => validCollectionIds.has(collectionId) && !initialSelected.has(collectionId)
  );
  const idsToRemove = [...initialSelected].filter(
    (collectionId) => validCollectionIds.has(collectionId) && !selected.has(collectionId)
  );

  return { idsToAdd, idsToRemove };
}

export function diffLibraryItemSelection(
  initialSelected: Set<string>,
  selected: Set<string>,
  validLibraryItemIds: Set<string>
): { idsToAdd: string[]; idsToRemove: string[] } {
  const idsToAdd = [...selected].filter(
    (libraryItemId) => validLibraryItemIds.has(libraryItemId) && !initialSelected.has(libraryItemId)
  );
  const idsToRemove = [...initialSelected].filter(
    (libraryItemId) => validLibraryItemIds.has(libraryItemId) && !selected.has(libraryItemId)
  );

  return { idsToAdd, idsToRemove };
}
