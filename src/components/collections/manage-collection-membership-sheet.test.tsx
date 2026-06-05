import React from "react";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import { Window } from "happy-dom";

const windowInstance = new Window();
globalThis.window = windowInstance as unknown as typeof globalThis.window;
globalThis.document = windowInstance.document as unknown as typeof globalThis.document;
globalThis.HTMLElement = windowInstance.HTMLElement as unknown as typeof globalThis.HTMLElement;
globalThis.Node = windowInstance.Node as unknown as typeof globalThis.Node;
globalThis.navigator = windowInstance.navigator as unknown as typeof globalThis.navigator;

const addBooksTo = mock(async () => {});
const removeBooksFrom = mock(async () => {});

let collectionsState = {
  collections: [
    { collectionId: "c1", name: "To Read", createdAt: 1, updatedAt: 1 },
    { collectionId: "c2", name: "Favorites", createdAt: 2, updatedAt: 2 },
  ],
  membership: new Map<string, Set<string>>([["c1", new Set(["lib-1"])]]),
};

mock.module("@/data/context", () => ({
  useStores: () => ({
    useCollectionsStore: () => ({
      collections: collectionsState.collections,
      membership: collectionsState.membership,
      addBooksTo,
      removeBooksFrom,
      getCollectionsForItem: (libraryItemId: string) =>
        collectionsState.collections.filter((collection) =>
          collectionsState.membership.get(collection.collectionId)?.has(libraryItemId)
        ),
    }),
  }),
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "collections.membershipTitle") return "Edit Collections";
      if (key === "collections.membershipDescription") return "Choose which collections should include this book.";
      if (key === "collections.membershipEmpty") return "Create a collection first, then choose which ones should include this book.";
      if (key === "collections.manage") return "Manage collections";
      if (key === "collections.bookCount") return options?.count === 1 ? "1 book" : "0 books";
      if (key === "common.cancel") return "Cancel";
      if (key === "common.save") return "Save";
      return key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

mock.module("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  ResponsiveDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  ResponsiveDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  ResponsiveDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

mock.module("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked }: { checked?: boolean }) => (
    <span data-testid="checkbox">{checked ? "checked" : "unchecked"}</span>
  ),
}));

mock.module("./collections-manager-dialog", () => ({
  CollectionsManagerDialog: ({ open }: { open: boolean }) =>
    open ? <div>Collections manager</div> : null,
}));

describe("ManageCollectionMembershipSheet", () => {
  beforeEach(() => {
    collectionsState = {
      collections: [
        { collectionId: "c1", name: "To Read", createdAt: 1, updatedAt: 1 },
        { collectionId: "c2", name: "Favorites", createdAt: 2, updatedAt: 2 },
      ],
      membership: new Map<string, Set<string>>([["c1", new Set(["lib-1"])]]),
    };
    addBooksTo.mockClear();
    removeBooksFrom.mockClear();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("stages row selection changes and saves membership diff", async () => {
    const { ManageCollectionMembershipSheet } = await import("./manage-collection-membership-sheet");

    const view = render(
      <ManageCollectionMembershipSheet
        open
        onOpenChange={() => {}}
        libraryItemId="lib-1"
      />
    );

    fireEvent.click(view.getByRole("checkbox", { name: /favorites/i }));
    fireEvent.click(view.getByRole("checkbox", { name: /to read/i }));

    expect(addBooksTo).not.toHaveBeenCalled();
    expect(removeBooksFrom).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: /save/i }));

    expect(addBooksTo).toHaveBeenCalledWith("c2", ["lib-1"]);
    expect(removeBooksFrom).toHaveBeenCalledWith("c1", ["lib-1"]);
  });

  it("offers a manage collections action instead of a new collection shortcut", async () => {
    const { ManageCollectionMembershipSheet } = await import("./manage-collection-membership-sheet");

    const view = render(
      <ManageCollectionMembershipSheet
        open
        onOpenChange={() => {}}
        libraryItemId="lib-1"
      />
    );

    expect(view.getByRole("button", { name: /manage collections/i })).toBeTruthy();
    expect(view.queryByRole("button", { name: /\+ new collection/i })).toBeNull();
  });
});
