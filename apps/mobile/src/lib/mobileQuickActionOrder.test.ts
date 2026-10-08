import { describe, expect, test } from "bun:test";
import { orderMobileTitleQuickActions } from "./mobileQuickActionOrder";

describe("title quick action order", () => {
  test("collection and source first, progress rewrite after them, removal last", () => {
    const ids = ["markAllRead", "addToCollection", "openInSource", "remove"].map((id) => ({ id }));
    expect(orderMobileTitleQuickActions(ids).map((action) => action.id)).toEqual([
      "addToCollection",
      "openInSource",
      "markAllRead",
      "remove",
    ]);
  });

  test("an action it does not know keeps its place before the progress rewrite and removal", () => {
    const ids = ["markAllRead", "addToCollection", "share", "remove"].map((id) => ({ id }));
    expect(orderMobileTitleQuickActions(ids).map((action) => action.id)).toEqual([
      "addToCollection",
      "share",
      "markAllRead",
      "remove",
    ]);
  });
});
