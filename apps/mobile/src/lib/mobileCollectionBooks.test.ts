import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import type { MobileCollectionActionState } from "./mobileCollections";
import {
  filterMobileCollectionBookEntries,
  getMobileCollectionBooksSheetLayout,
  MOBILE_COLLECTION_BOOKS_SEARCH_THRESHOLD,
  normalizeMobileCollectionBooksQuery,
  planMobileCollectionBooksSave,
  shouldShowMobileCollectionBooksSearch,
} from "./mobileCollectionBooks";

function entry(
  libraryItemId: string,
  title: string,
  options: { authors?: string[]; overrideTitle?: string; overrideAuthors?: string[] } = {},
): LibraryEntry {
  return {
    item: {
      libraryItemId,
      metadata: { title, authors: options.authors },
      overrides:
        options.overrideTitle || options.overrideAuthors
          ? { metadata: { title: options.overrideTitle, authors: options.overrideAuthors } }
          : undefined,
      addedAt: 1,
      updatedAt: 1,
    },
    sources: [],
  } as unknown as LibraryEntry;
}

const idle: MobileCollectionActionState = {
  creating: false,
  renaming: false,
  savingMembership: false,
  removing: false,
};

describe("collection book search", () => {
  const entries = [
    entry("a", "Blue Lock", { authors: ["Muneyuki Kaneshiro"] }),
    entry("b", "地縛少年 花子くん", { authors: ["あいだいろ"] }),
    entry("c", "Original Name", { overrideTitle: "Renamed Title" }),
    entry("d", "Chainsaw Man", { overrideAuthors: ["Tatsuki Fujimoto"] }),
  ];
  const ids = (list: LibraryEntry[]) => list.map((item) => item.item.libraryItemId);

  test("an empty or blank query keeps every book in order", () => {
    expect(filterMobileCollectionBookEntries(entries, "")).toBe(entries);
    expect(filterMobileCollectionBookEntries(entries, "   ")).toBe(entries);
  });

  test("matches titles case-insensitively, including full-width input", () => {
    expect(ids(filterMobileCollectionBookEntries(entries, "blue"))).toEqual(["a"]);
    expect(ids(filterMobileCollectionBookEntries(entries, "ＢＬＵＥ"))).toEqual(["a"]);
    expect(ids(filterMobileCollectionBookEntries(entries, "花子"))).toEqual(["b"]);
  });

  test("matches authors and both the shown and the original title", () => {
    expect(ids(filterMobileCollectionBookEntries(entries, "kaneshiro"))).toEqual(["a"]);
    expect(ids(filterMobileCollectionBookEntries(entries, "fujimoto"))).toEqual(["d"]);
    expect(ids(filterMobileCollectionBookEntries(entries, "renamed"))).toEqual(["c"]);
    expect(ids(filterMobileCollectionBookEntries(entries, "original"))).toEqual(["c"]);
    expect(filterMobileCollectionBookEntries(entries, "zzz")).toEqual([]);
  });

  test("normalizes queries", () => {
    expect(normalizeMobileCollectionBooksQuery("  Ｂｌｕｅ Lock ")).toBe("blue lock");
  });

  test("the search field appears only for libraries past the threshold", () => {
    expect(shouldShowMobileCollectionBooksSearch(MOBILE_COLLECTION_BOOKS_SEARCH_THRESHOLD)).toBe(false);
    expect(shouldShowMobileCollectionBooksSearch(MOBILE_COLLECTION_BOOKS_SEARCH_THRESHOLD + 1)).toBe(true);
  });
});

describe("collection book save plan", () => {
  test("nothing staged keeps Save disabled", () => {
    expect(
      planMobileCollectionBooksSave({
        actionState: idle,
        allowRename: true,
        initialName: "Shelf",
        draftName: "Shelf",
        membershipChangeCount: 0,
      }),
    ).toEqual({ canSave: false, renameTo: null, saveMembership: false, nameInvalid: false, dirty: false });
  });

  test("membership changes alone save without a rename", () => {
    const plan = planMobileCollectionBooksSave({
      actionState: idle,
      allowRename: false,
      initialName: "Shelf",
      draftName: "",
      membershipChangeCount: 2,
    });
    expect(plan).toMatchObject({ canSave: true, renameTo: null, saveMembership: true, dirty: true });
  });

  test("a changed name is trimmed and committed with the membership", () => {
    const plan = planMobileCollectionBooksSave({
      actionState: idle,
      allowRename: true,
      initialName: "Shelf",
      draftName: "  Weekend  ",
      membershipChangeCount: 1,
    });
    expect(plan).toMatchObject({ canSave: true, renameTo: "Weekend", saveMembership: true });
  });

  test("whitespace around the same name is not a rename", () => {
    const plan = planMobileCollectionBooksSave({
      actionState: idle,
      allowRename: true,
      initialName: "Shelf",
      draftName: "Shelf ",
      membershipChangeCount: 0,
    });
    expect(plan.renameTo).toBeNull();
    expect(plan.canSave).toBe(false);
    // Still an edit the person made: swipe-down should not throw it away.
    expect(plan.dirty).toBe(true);
  });

  test("an empty name blocks Save even with membership changes", () => {
    const plan = planMobileCollectionBooksSave({
      actionState: idle,
      allowRename: true,
      initialName: "Shelf",
      draftName: "   ",
      membershipChangeCount: 3,
    });
    expect(plan).toMatchObject({ canSave: false, nameInvalid: true, renameTo: null });
  });

  test("another collection action in flight blocks Save", () => {
    const plan = planMobileCollectionBooksSave({
      actionState: { ...idle, savingMembership: true },
      allowRename: false,
      initialName: "Shelf",
      draftName: "",
      membershipChangeCount: 1,
    });
    expect(plan.canSave).toBe(false);
  });

  test("Add Books ignores the name entirely", () => {
    const plan = planMobileCollectionBooksSave({
      actionState: idle,
      allowRename: false,
      initialName: "Shelf",
      draftName: "",
      membershipChangeCount: 0,
    });
    expect(plan).toEqual({ canSave: false, renameTo: null, saveMembership: false, nameInvalid: false, dirty: false });
  });
});

describe("collection book sheet layout", () => {
  const portrait = { fontScale: 1, height: 932, width: 430 };

  test("a short library opens at its content height with a full-height detent", () => {
    const layout = getMobileCollectionBooksSheetLayout({ ...portrait, entryCount: 3, allowRename: false });
    expect(layout.snapPoints).toHaveLength(2);
    expect(layout.snapPoints[1]).toBe("100%");
    const first = Number.parseInt(layout.snapPoints[0], 10);
    expect(first).toBeGreaterThanOrEqual(36);
    expect(first).toBeLessThan(62);
  });

  test("a long library starts a little over half height", () => {
    expect(
      getMobileCollectionBooksSheetLayout({ ...portrait, entryCount: 40, allowRename: false }).snapPoints,
    ).toEqual(["62%", "100%"]);
  });

  test("Edit Collection starts taller so books still show under its fields", () => {
    expect(
      getMobileCollectionBooksSheetLayout({ ...portrait, entryCount: 40, allowRename: true }).snapPoints,
    ).toEqual(["72%", "100%"]);
  });

  test("Edit Collection reserves room for the name and delete rows", () => {
    const add = getMobileCollectionBooksSheetLayout({ ...portrait, entryCount: 2, allowRename: false });
    const edit = getMobileCollectionBooksSheetLayout({ ...portrait, entryCount: 2, allowRename: true });
    expect(Number.parseInt(edit.snapPoints[0], 10)).toBeGreaterThan(Number.parseInt(add.snapPoints[0], 10));
  });

  test("larger text grows the starting detent", () => {
    const regular = getMobileCollectionBooksSheetLayout({ ...portrait, entryCount: 4, allowRename: false });
    const large = getMobileCollectionBooksSheetLayout({ ...portrait, fontScale: 1.5, entryCount: 4, allowRename: false });
    expect(Number.parseInt(large.snapPoints[0], 10)).toBeGreaterThan(Number.parseInt(regular.snapPoints[0], 10));
  });

  test("a phone on its side uses the full height", () => {
    expect(
      getMobileCollectionBooksSheetLayout({ fontScale: 1, height: 430, width: 932, entryCount: 3, allowRename: false })
        .snapPoints,
    ).toEqual(["100%"]);
  });
});
