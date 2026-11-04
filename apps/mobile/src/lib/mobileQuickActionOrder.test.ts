import { describe, expect, test } from "bun:test";
import { orderMobileTitleQuickActions } from "./mobileQuickActionOrder";

describe("title quick action order", () => {
  test("collection and source first, an unknown action keeps its place, progress rewrite and removal last", () => {
    const order = (ids: string[]) => orderMobileTitleQuickActions(ids.map((id) => ({ id }))).map((action) => action.id);
    expect(order(["markAllRead", "addToCollection", "openInSource", "remove"])).toEqual([
      "addToCollection",
      "openInSource",
      "markAllRead",
      "remove",
    ]);
    expect(order(["markAllRead", "addToCollection", "share", "remove"])).toEqual([
      "addToCollection",
      "share",
      "markAllRead",
      "remove",
    ]);
  });
});
