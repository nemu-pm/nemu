import { describe, expect, test } from "bun:test";
import {
  getMobileSettingsPrimaryPane,
  getMobileSettingsSplitColumnTitles as columnTitles,
  getMobileSettingsSplitHighlightedRow,
  resolveMobileSettingsSplitSelection as resolve,
} from "./mobileSettingsSplit";

describe("settings split selection", () => {
  test("defaults to the first section", () => {
    expect(resolve({ selected: null, routeSection: null, focus: undefined })).toBe("reader");
  });

  test("a deep link to settings/[section] selects that section", () => {
    expect(resolve({ selected: null, routeSection: "sources", focus: undefined })).toBe("sources");
  });

  test("the agent focus deep link implies Data", () => {
    expect(resolve({ selected: null, routeSection: null, focus: "agent" })).toBe("data");
  });

  test("an explicit selection wins over the route", () => {
    expect(resolve({ selected: "appearance", routeSection: "sources", focus: "agent" })).toBe("appearance");
  });

  test("Source Directories keeps Installed Sources selected in the section list", () => {
    expect(getMobileSettingsSplitHighlightedRow("directories")).toBe("sources");
    for (const section of ["reader", "sources", "appearance", "data", "experimental"] as const) {
      expect(getMobileSettingsSplitHighlightedRow(section)).toBe(section);
    }
  });

  test("the route's own instance keeps its pane across a resize", () => {
    expect(getMobileSettingsPrimaryPane(null)).toBe("list");
    expect(getMobileSettingsPrimaryPane("data")).toBe("detail");
  });

  test("each column carries its own title on the Duo; iPad and Android keep the native one", () => {
    const base = { split: true, platform: "ios", isPad: false, verticalBar: false };
    expect(columnTitles(base)).toBe("center");
    expect(columnTitles({ ...base, verticalBar: true })).toBe("leading");
    expect(columnTitles({ ...base, split: false })).toBeNull();
    expect(columnTitles({ ...base, isPad: true })).toBeNull();
    expect(columnTitles({ ...base, platform: "android" })).toBeNull();
  });
});
