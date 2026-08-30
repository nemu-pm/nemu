import { describe, expect, it } from "bun:test";
import { nemuColorWithAlpha } from "./colorAlpha";

describe("nemuColorWithAlpha", () => {
  it("converts six-digit hex to rgba", () => {
    expect(nemuColorWithAlpha("#090a0d", 1)).toBe("rgba(9,10,13,1)");
    expect(nemuColorWithAlpha("#f8fafe", 0)).toBe("rgba(248,250,254,0)");
  });

  it("expands three-digit hex", () => {
    expect(nemuColorWithAlpha("#fff", 0.5)).toBe("rgba(255,255,255,0.5)");
  });

  it("clamps alpha into [0, 1]", () => {
    expect(nemuColorWithAlpha("#000000", 2)).toBe("rgba(0,0,0,1)");
    expect(nemuColorWithAlpha("#000000", -1)).toBe("rgba(0,0,0,0)");
  });

  it("passes through non-hex values unchanged", () => {
    expect(nemuColorWithAlpha("rgba(1,2,3,0.4)", 1)).toBe("rgba(1,2,3,0.4)");
    expect(nemuColorWithAlpha("transparent", 0)).toBe("transparent");
  });
});
