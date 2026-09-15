import { describe, expect, test } from "bun:test";
import {
  resolveMobileSourceHomeSectionPlaceholder,
  resolveMobileSourceHomeSectionStatus,
} from "./mobileSourceHomeSectionState";

describe("mobileSourceHomeSectionState", () => {
  test("renders nothing extra once a section has items", () => {
    expect(
      resolveMobileSourceHomeSectionPlaceholder({
        status: "loading",
        itemCount: 3,
      }),
    ).toBe("none");
    expect(
      resolveMobileSourceHomeSectionPlaceholder({
        status: "ready",
        itemCount: 1,
      }),
    ).toBe("none");
  });

  test("keeps skeletons for an empty section that is still loading", () => {
    expect(
      resolveMobileSourceHomeSectionPlaceholder({
        status: "loading",
        itemCount: 0,
      }),
    ).toBe("skeleton");
  });

  test("replaces the permanent grey row with an empty state once resolved", () => {
    // A region-blocked rail or a legacy listing resolves to zero links; the
    // old code showed skeleton cards for those forever.
    expect(
      resolveMobileSourceHomeSectionPlaceholder({
        status: "ready",
        itemCount: 0,
      }),
    ).toBe("empty");
  });

  test("treats only an in-flight home fetch as loading", () => {
    expect(resolveMobileSourceHomeSectionStatus("idle")).toBe("loading");
    expect(resolveMobileSourceHomeSectionStatus("loading")).toBe("loading");
    expect(resolveMobileSourceHomeSectionStatus("ready")).toBe("ready");
    expect(resolveMobileSourceHomeSectionStatus("blocked")).toBe("ready");
    expect(resolveMobileSourceHomeSectionStatus("error")).toBe("ready");
  });
});
