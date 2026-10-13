import { describe, expect, test } from "bun:test";
import { resolveMobilePoseLayout } from "./mobilePoseLayoutGate";

const layout = () => "glide";

describe("resolveMobilePoseLayout", () => {
  test("drops the layout transition while a resize pose change is open", () => {
    expect(resolveMobilePoseLayout("resize", true, layout)).toBeUndefined();
  });
  test("restores it once the motion window has closed", () => {
    expect(resolveMobilePoseLayout("resize", false, layout)).toBe(layout);
  });
  test("keeps it for constant-size pose changes and no change", () => {
    expect(resolveMobilePoseLayout("layout", true, layout)).toBe(layout);
    expect(resolveMobilePoseLayout("none", true, layout)).toBe(layout);
  });
});
