import { formatMobileString, type MobileStrings } from "./mobileI18n";

/**
 * Deleting the collection a pushed `library/collection/[id]` screen shows
 * (its Manage sheet, the remove confirmation, the collections manager) leaves
 * that screen: back to whatever pushed it, with a success toast there.
 *
 * The step back waits for the sheet's dismissal (a native sheet can't stay
 * presented over a popped screen), so until then the screen keeps its sheets
 * mounted behind a blank page instead of the "Collection not found" state —
 * that early return used to unmount the sheets, the dismissal never fired and
 * the queued step back was dropped.
 */
export function isMobileLibraryOpenCollectionDeleted({
  isCollectionRoute,
  routeCollectionId,
  deletedCollectionId,
}: {
  isCollectionRoute: boolean;
  routeCollectionId: string | null;
  deletedCollectionId: string;
}): boolean {
  return isCollectionRoute && routeCollectionId !== null && routeCollectionId === deletedCollectionId;
}

export type MobileLibraryRouteCollectionState = "shown" | "leaving-deleted" | "missing";

export function resolveMobileLibraryRouteCollectionState({
  isCollectionRoute,
  loading,
  missing,
  leavingDeletedCollectionId,
  routeCollectionId,
}: {
  isCollectionRoute: boolean;
  loading: boolean;
  missing: boolean;
  leavingDeletedCollectionId: string | null;
  routeCollectionId: string | null;
}): MobileLibraryRouteCollectionState {
  if (!isCollectionRoute || loading || !missing) return "shown";
  if (leavingDeletedCollectionId !== null && leavingDeletedCollectionId === routeCollectionId) {
    return "leaving-deleted";
  }
  return "missing";
}

export type MobileLibraryDeletedCollectionRouter = {
  canGoBack: () => boolean;
  back: () => void;
  dismissTo: (href: "/library") => void;
};

/** Back to the screen that pushed the collection (Library or the collections list). */
export function leaveMobileLibraryDeletedCollection(router: MobileLibraryDeletedCollectionRouter): void {
  if (router.canGoBack()) router.back();
  else router.dismissTo("/library");
}

export const MOBILE_COLLECTION_DELETED_TOAST_ID = "collection-deleted";

/** Camo 1227: success, 4s (normal), no undo — the store's delete has none. */
export function buildMobileCollectionDeletedToast(strings: MobileStrings, name: string) {
  return {
    id: MOBILE_COLLECTION_DELETED_TOAST_ID,
    tone: "success" as const,
    title: formatMobileString(strings.feedback.collectionDeleted, { name }),
    duration: "normal" as const,
  };
}
