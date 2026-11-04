import { describe, expect, test } from "bun:test";
import {
  getCompactSourceBrowseHeaderBarHeight,
  shouldUseCompactSourceBrowseHeader as compact,
} from "./mobileSourceBrowseHeader";

describe("source browse compact header", () => {
  test("iOS keeps native navigation in every window (the system places Duo's bars)", () => {
    expect(compact("ios")).toBe(false);
  });
  test("Android measures its own title and search rows", () => {
    expect(compact("android")).toBe(true);
    expect(getCompactSourceBrowseHeaderBarHeight(false)).toBe(44);
    expect(getCompactSourceBrowseHeaderBarHeight(true)).toBe(92);
  });
  test("does not change the existing web layout", () => {
    expect(compact("web")).toBe(false);
  });
});
