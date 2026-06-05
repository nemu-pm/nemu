import React from "react";
import { beforeEach, describe, expect, it, mock } from "bun:test";
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

const libraryEntries = [
  {
    item: { libraryItemId: "lib-1" },
    sources: [],
    overrides: {},
    primarySource: {
      metadata: {
        title: "One Piece",
        authors: ["Eiichiro Oda"],
      },
    },
  },
  {
    item: { libraryItemId: "lib-2" },
    sources: [],
    overrides: {},
    primarySource: {
      metadata: {
        title: "Frieren",
        authors: ["Kanehito Yamada"],
      },
    },
  },
];

let membership = new Map<string, Set<string>>([["c1", new Set(["lib-1"])]]);

mock.module("@/data/context", () => ({
  useStores: () => ({
    useLibraryStore: () => ({
      entries: libraryEntries,
    }),
    useCollectionsStore: () => ({
      membership,
      addBooksTo,
      removeBooksFrom,
    }),
  }),
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "collections.addBooksTitle") return "Add Books";
      if (key === "collections.addBooksDescription") return "Choose which library books belong in this collection.";
      if (key === "common.cancel") return "Cancel";
      if (key === "common.save") return "Save";
      return key;
    },
  }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

mock.module("@/data/view", () => ({
  getEntryEffectiveMetadata: (entry: (typeof libraryEntries)[number]) => entry.primarySource.metadata,
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

describe("AddBooksSheet", () => {
  beforeEach(() => {
    membership = new Map<string, Set<string>>([["c1", new Set(["lib-1"])]]);
    addBooksTo.mockClear();
    removeBooksFrom.mockClear();
  });

  it("stages row selection changes and saves the diff", async () => {
    const { AddBooksSheet } = await import("./add-books-sheet");

    const view = render(
      <AddBooksSheet
        open
        onOpenChange={() => {}}
        collectionId="c1"
      />
    );

    fireEvent.click(view.getByRole("checkbox", { name: /one piece/i }));
    fireEvent.click(view.getByRole("checkbox", { name: /frieren/i }));

    expect(addBooksTo).not.toHaveBeenCalled();
    expect(removeBooksFrom).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: /save/i }));

    expect(addBooksTo).toHaveBeenCalledWith("c1", ["lib-2"]);
    expect(removeBooksFrom).toHaveBeenCalledWith("c1", ["lib-1"]);
  });
});
