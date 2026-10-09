import type { LocalCollection } from "@/data/schema";
import { collectionCount } from "@/lib/mobileCollections";

/**
 * The Library tab's title menu (iOS Files-style: tap the navigation title to
 * switch the shown collection). One platform-neutral model; the iOS UIKit menu
 * and the Android Compose dropdown both render it.
 *
 * Sections, in order:
 * 1. scope — "All" then every collection, a checkmark on the shown one and
 *    the book count as the subtitle. "All" is always present, so the library
 *    root is always one tap away.
 * 2. current — actions on the shown collection (only when one is shown).
 * 3. collections — create / manage.
 */

export type MobileLibraryTitleMenuIcon =
  | "library"
  | "collection"
  | "edit"
  | "create"
  | "manage";

export type MobileLibraryTitleMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon: MobileLibraryTitleMenuIcon;
  checked: boolean;
  disabled: boolean;
};

export type MobileLibraryTitleMenuSection = {
  id: "scope" | "current" | "collections";
  items: MobileLibraryTitleMenuItem[];
};

export type MobileLibraryTitleMenuAction =
  | { type: "select"; collectionId: string | null }
  | { type: "edit-current" }
  | { type: "create" }
  | { type: "manage" };

export const MOBILE_LIBRARY_TITLE_MENU_ALL = "library:all";
export const MOBILE_LIBRARY_TITLE_MENU_COLLECTION_PREFIX = "library:collection:";
export const MOBILE_LIBRARY_TITLE_MENU_EDIT_CURRENT = "library:edit-current";
export const MOBILE_LIBRARY_TITLE_MENU_CREATE = "library:create";
export const MOBILE_LIBRARY_TITLE_MENU_MANAGE = "library:manage";

export type MobileLibraryTitleMenuLabels = {
  all: string;
  editCollection: string;
  newCollection: string;
  manageCollections: string;
  bookCount: (count: number) => string;
};

export function mobileLibraryTitleMenuItemId(collectionId: string | null): string {
  return collectionId
    ? `${MOBILE_LIBRARY_TITLE_MENU_COLLECTION_PREFIX}${collectionId}`
    : MOBILE_LIBRARY_TITLE_MENU_ALL;
}

export function buildMobileLibraryTitleMenu({
  collections,
  membership,
  libraryCount,
  selectedCollectionId,
  labels,
  disabled,
}: {
  /** Already in display order (`sortCollections`). */
  collections: LocalCollection[];
  membership: Map<string, Set<string>>;
  libraryCount: number;
  /** The collection actually shown (null = All). */
  selectedCollectionId: string | null;
  labels: MobileLibraryTitleMenuLabels;
  /** A collection write is in flight: keep the menu readable, block actions. */
  disabled: boolean;
}): MobileLibraryTitleMenuSection[] {
  const shown =
    selectedCollectionId === null
      ? null
      : (collections.find((item) => item.collectionId === selectedCollectionId) ??
        null);

  const scope: MobileLibraryTitleMenuSection = {
    id: "scope",
    items: [
      {
        id: MOBILE_LIBRARY_TITLE_MENU_ALL,
        title: labels.all,
        subtitle: labels.bookCount(libraryCount),
        icon: "library",
        checked: shown === null,
        disabled,
      },
      ...collections.map((collection) => ({
        id: mobileLibraryTitleMenuItemId(collection.collectionId),
        title: collection.name,
        subtitle: labels.bookCount(collectionCount(collection.collectionId, membership)),
        icon: "collection" as const,
        checked: shown?.collectionId === collection.collectionId,
        disabled,
      })),
    ],
  };

  const sections: MobileLibraryTitleMenuSection[] = [scope];
  if (shown) {
    sections.push({
      id: "current",
      items: [
        {
          id: MOBILE_LIBRARY_TITLE_MENU_EDIT_CURRENT,
          title: labels.editCollection,
          icon: "edit",
          checked: false,
          disabled,
        },
      ],
    });
  }
  sections.push({
    id: "collections",
    items: [
      {
        id: MOBILE_LIBRARY_TITLE_MENU_CREATE,
        title: labels.newCollection,
        icon: "create",
        checked: false,
        disabled,
      },
      {
        id: MOBILE_LIBRARY_TITLE_MENU_MANAGE,
        title: labels.manageCollections,
        icon: "manage",
        checked: false,
        // Managing an empty list is still where collections get created.
        disabled,
      },
    ],
  });
  return sections;
}

export function resolveMobileLibraryTitleMenuAction(
  id: string,
): MobileLibraryTitleMenuAction | null {
  if (id === MOBILE_LIBRARY_TITLE_MENU_ALL) return { type: "select", collectionId: null };
  if (id === MOBILE_LIBRARY_TITLE_MENU_EDIT_CURRENT) return { type: "edit-current" };
  if (id === MOBILE_LIBRARY_TITLE_MENU_CREATE) return { type: "create" };
  if (id === MOBILE_LIBRARY_TITLE_MENU_MANAGE) return { type: "manage" };
  if (id.startsWith(MOBILE_LIBRARY_TITLE_MENU_COLLECTION_PREFIX)) {
    const collectionId = id.slice(MOBILE_LIBRARY_TITLE_MENU_COLLECTION_PREFIX.length);
    return collectionId ? { type: "select", collectionId } : null;
  }
  return null;
}

/**
 * The selection to keep after a collections reload: a selected collection
 * that was there before and is gone now (deleted here or on another device)
 * falls back to All, so the title never names a missing collection. A
 * selection this screen has not seen loaded yet is kept (the effective scope
 * is All until it appears), so a just-created or deep-linked collection is
 * never dropped by a reload that has not caught up.
 */
export function reconcileMobileLibraryCollectionSelection({
  previousCollections,
  collections,
  loading,
  selectedCollectionId,
}: {
  previousCollections: LocalCollection[];
  collections: LocalCollection[];
  loading: boolean;
  selectedCollectionId: string | null;
}): string | null {
  if (selectedCollectionId === null || loading) return selectedCollectionId;
  const contains = (list: LocalCollection[]) =>
    list.some((item) => item.collectionId === selectedCollectionId);
  return contains(previousCollections) && !contains(collections)
    ? null
    : selectedCollectionId;
}

/**
 * What the `library/collection/[id]` deep-link route does once collections
 * load: an existing collection is selected on the Library root (the route
 * closes itself, so there is one Library screen with the title menu); an
 * unknown one shows the not-found state.
 */
export function resolveMobileLibraryCollectionRoute({
  collections,
  loading,
  routeCollectionId,
}: {
  collections: LocalCollection[];
  loading: boolean;
  routeCollectionId: string | null;
}): { action: "wait" } | { action: "select"; collectionId: string | null } | { action: "not-found" } {
  if (routeCollectionId === null) return { action: "select", collectionId: null };
  if (loading) return { action: "wait" };
  return collections.some((item) => item.collectionId === routeCollectionId)
    ? { action: "select", collectionId: routeCollectionId }
    : { action: "not-found" };
}

/**
 * The Library tab's shown collection, shared by the tab root and the
 * collection deep-link route. In memory for the app session, like web, where
 * the collection lives in the URL and a fresh start opens All.
 */
type Listener = () => void;
let currentSelection: string | null = null;
const listeners = new Set<Listener>();

export function getMobileLibraryCollectionSelection(): string | null {
  return currentSelection;
}

export function setMobileLibraryCollectionSelection(collectionId: string | null): void {
  const next = collectionId?.trim() ? collectionId.trim() : null;
  if (next === currentSelection) return;
  currentSelection = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeMobileLibraryCollectionSelection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
