import { describe, expect, test } from "bun:test";
import { mobileExploreDetailRailHasButtons, splitMobileExploreDetailBarActions } from "./mobileExploreDetailRail";

const actions = [
  { icon: "rectangle.stack.badge.plus", label: "Add to Collection" },
  { icon: "checkmark.circle", label: "Mark Finished" },
  { icon: "circle", label: "Mark as Unread" },
  { icon: "square.and.arrow.up", label: "Share" },
  { icon: "link", label: "Copy Link" },
  { icon: "pencil", label: "Edit Metadata" },
  { icon: "square.stack.3d.up", label: "Manage Sources" },
  { icon: "trash", label: "Remove from Library" },
];

describe("mobileExploreDetailRailHasButtons", () => {
  test("Duo inner landscape: the rail holds the buttons", () => {
    expect(mobileExploreDetailRailHasButtons({ verticalBarSide: "left", hasFoldRegion: true })).toBe(true);
    expect(mobileExploreDetailRailHasButtons({ verticalBarSide: "right", hasFoldRegion: true })).toBe(true);
  });

  test("outer display (a vertical bar, no fold): the single menu", () => {
    expect(mobileExploreDetailRailHasButtons({ verticalBarSide: "right", hasFoldRegion: false })).toBe(false);
  });

  test("inner portrait and every horizontal bar: the single menu", () => {
    expect(mobileExploreDetailRailHasButtons({ verticalBarSide: null, hasFoldRegion: true })).toBe(false);
    expect(mobileExploreDetailRailHasButtons({ verticalBarSide: null, hasFoldRegion: false })).toBe(false);
  });
});

describe("splitMobileExploreDetailBarActions", () => {
  test("no rail: everything stays in the menu", () => {
    const split = splitMobileExploreDetailBarActions(actions, false);
    expect(split.buttons).toEqual([]);
    expect(split.menu).toEqual(actions);
  });

  test("rail: Add to Collection and Share leave the menu, Copy Link stays", () => {
    const split = splitMobileExploreDetailBarActions(actions, true);
    expect(split.buttons.map((action) => action.label)).toEqual(["Add to Collection", "Share"]);
    expect(split.menu.map((action) => action.label)).toEqual([
      "Mark Finished",
      "Mark as Unread",
      "Copy Link",
      "Edit Metadata",
      "Manage Sources",
      "Remove from Library",
    ]);
  });

  test("rail without a web page: Add to Collection only", () => {
    const split = splitMobileExploreDetailBarActions(
      actions.filter((action) => action.label !== "Share" && action.label !== "Copy Link"),
      true,
    );
    expect(split.buttons.map((action) => action.label)).toEqual(["Add to Collection"]);
  });
});
