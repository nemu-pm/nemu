import { describe, expect, test } from "bun:test";
import { getMobileSourceManagerSheetLayout } from "./mobileSourceManagerLayout";

describe("getMobileSourceManagerSheetLayout", () => {
  test("hugs a short source list", () => {
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelOpen: false,
        addPanelRowCount: 0,
        fontScale: 1,
        height: 800,
        sourceCount: 1,
        width: 400,
      }),
    ).toEqual({ fillContent: false, snapPoints: undefined });
  });

  test("hugs a short search state", () => {
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelOpen: true,
        addPanelRowCount: 1,
        fontScale: 1,
        height: 800,
        sourceCount: 1,
        width: 400,
      }),
    ).toEqual({ fillContent: false, snapPoints: undefined });
  });

  test("keeps the live-filtered merge list in a stable viewport", () => {
    for (const addPanelRowCount of [0, 1, 7]) {
      expect(
        getMobileSourceManagerSheetLayout({
          addPanelFiltersWhileTyping: true,
          addPanelOpen: true,
          addPanelRowCount,
          fontScale: 1,
          height: 800,
          sourceCount: 1,
          width: 400,
        }),
      ).toEqual({ fillContent: true, snapPoints: ["88%"] });
    }
    // Only the open add panel has a list to filter.
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelFiltersWhileTyping: true,
        addPanelOpen: false,
        addPanelRowCount: 0,
        fontScale: 1,
        height: 800,
        sourceCount: 1,
        width: 400,
      }),
    ).toEqual({ fillContent: false, snapPoints: undefined });
  });

  test("keeps long search results in a stable viewport", () => {
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelOpen: true,
        addPanelRowCount: 2,
        fontScale: 1,
        height: 800,
        sourceCount: 1,
        width: 400,
      }),
    ).toEqual({ fillContent: true, snapPoints: ["88%"] });
  });

  test("bounds a long source list", () => {
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelOpen: false,
        addPanelRowCount: 0,
        fontScale: 1,
        height: 700,
        sourceCount: 6,
        width: 400,
      }),
    ).toEqual({ fillContent: true, snapPoints: ["82%"] });
  });

  test("bounds multi-source lists in landscape", () => {
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelOpen: false,
        addPanelRowCount: 0,
        fontScale: 1,
        height: 400,
        sourceCount: 2,
        width: 800,
      }),
    ).toEqual({ fillContent: true, snapPoints: ["82%"] });
  });

  test("accounts for accessibility text sizes", () => {
    expect(
      getMobileSourceManagerSheetLayout({
        addPanelOpen: false,
        addPanelRowCount: 0,
        fontScale: 2,
        height: 650,
        sourceCount: 3,
        width: 400,
      }),
    ).toEqual({ fillContent: true, snapPoints: ["82%"] });
  });
});
