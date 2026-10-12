import { describe, expect, test } from "bun:test";
import {
  getMobileSettingsPrimaryPane,
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

  test("the route's own instance keeps its pane across a resize", () => {
    expect(getMobileSettingsPrimaryPane(null)).toBe("list");
    expect(getMobileSettingsPrimaryPane("data")).toBe("detail");
  });
});
