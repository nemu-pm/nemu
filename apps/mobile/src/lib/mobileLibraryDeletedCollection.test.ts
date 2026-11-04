import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileStrings } from "./mobileI18n";
import {
  buildMobileCollectionDeletedToast,
  isMobileLibraryOpenCollectionDeleted,
  leaveMobileLibraryDeletedCollection,
  MOBILE_COLLECTION_DELETED_TOAST_ID,
  resolveMobileLibraryRouteCollectionState,
} from "./mobileLibraryDeletedCollection";

describe("deleting the open collection", () => {
  test("only the pushed collection screen showing that collection leaves", () => {
    expect(
      isMobileLibraryOpenCollectionDeleted({
        isCollectionRoute: true,
        routeCollectionId: "c1",
        deletedCollectionId: "c1",
      }),
    ).toBe(true);
    expect(
      isMobileLibraryOpenCollectionDeleted({
        isCollectionRoute: true,
        routeCollectionId: "c1",
        deletedCollectionId: "c2",
      }),
    ).toBe(false);
    // The Library root (incl. Duo split/rail) shows collections as a
    // selection and already falls back to All.
    expect(
      isMobileLibraryOpenCollectionDeleted({
        isCollectionRoute: false,
        routeCollectionId: null,
        deletedCollectionId: "c1",
      }),
    ).toBe(false);
  });

  test("a just-deleted route collection is never shown as not found", () => {
    const base = {
      isCollectionRoute: true,
      loading: false,
      missing: true,
      routeCollectionId: "c1",
    };
    expect(resolveMobileLibraryRouteCollectionState({ ...base, leavingDeletedCollectionId: "c1" })).toBe(
      "leaving-deleted",
    );
    // An unknown id (deep link, deleted elsewhere) keeps the not-found state.
    expect(resolveMobileLibraryRouteCollectionState({ ...base, leavingDeletedCollectionId: null })).toBe(
      "missing",
    );
    expect(resolveMobileLibraryRouteCollectionState({ ...base, leavingDeletedCollectionId: "c2" })).toBe(
      "missing",
    );
    expect(
      resolveMobileLibraryRouteCollectionState({ ...base, missing: false, leavingDeletedCollectionId: null }),
    ).toBe("shown");
    expect(
      resolveMobileLibraryRouteCollectionState({ ...base, loading: true, leavingDeletedCollectionId: null }),
    ).toBe("shown");
    expect(
      resolveMobileLibraryRouteCollectionState({
        ...base,
        isCollectionRoute: false,
        leavingDeletedCollectionId: null,
      }),
    ).toBe("shown");
  });

  test("steps back to what pushed it, else to the Library", () => {
    const calls: string[] = [];
    const make = (canGoBack: boolean) => ({
      canGoBack: () => canGoBack,
      back: () => calls.push("back"),
      dismissTo: (href: "/library") => calls.push(`dismissTo:${href}`),
    });
    leaveMobileLibraryDeletedCollection(make(true));
    leaveMobileLibraryDeletedCollection(make(false));
    expect(calls).toEqual(["back", "dismissTo:/library"]);
  });

  test("success toast with Camo's copy, 4s, no undo", () => {
    const en = buildMobileCollectionDeletedToast(getMobileStrings("en"), "Weekend");
    expect(en).toEqual({
      id: MOBILE_COLLECTION_DELETED_TOAST_ID,
      tone: "success",
      title: 'Deleted "Weekend"',
      duration: "normal",
    });
    expect("action" in en).toBe(false);
    expect(buildMobileCollectionDeletedToast(getMobileStrings("zh"), "周末").title).toBe(
      "已删除收藏夹「周末」",
    );
    expect(buildMobileCollectionDeletedToast(getMobileStrings("ja"), "週末").title).toBe(
      "コレクション「週末」を削除しました",
    );
  });

  test("LibraryScreen keeps the sheets mounted while leaving and queues the step back", () => {
    const screen = readFileSync(path.join(import.meta.dir, "..", "screens", "LibraryScreen.tsx"), "utf8");
    const leavingBranch = screen.indexOf('if (routeCollectionState === "leaving-deleted") {');
    const missingBranch = screen.indexOf("if (routeCollectionMissing) {");
    expect(leavingBranch).toBeGreaterThan(-1);
    expect(missingBranch).toBeGreaterThan(leavingBranch);
    expect(screen.slice(leavingBranch, missingBranch)).toContain("{librarySheets}");
    expect(screen).toContain("if (!queueAfterSheetDismiss(source, leave)) leave();");
    expect(screen).toContain("toast.show(buildMobileCollectionDeletedToast(strings, collection.name));");
  });
});
