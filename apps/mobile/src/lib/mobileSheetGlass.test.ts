import { describe, expect, test } from "bun:test";
import { mobileSheetGlassLook, resolveMobileSheetGlassTrial } from "./mobileSheetGlass";

describe("sheet glass look", () => {
  test("defaults to the tinted glass the owner picked", () => {
    expect(resolveMobileSheetGlassTrial(undefined)).toBe("tinted");
    expect(resolveMobileSheetGlassTrial("")).toBe("tinted");
    expect(resolveMobileSheetGlassTrial("off")).toBe("off");
    expect(resolveMobileSheetGlassTrial("clear")).toBe("clear");
  });

  test("only iOS 26+ draws glass; artwork sheets keep their own colour", () => {
    expect(mobileSheetGlassLook({ platformOS: "ios", platformVersion: "26.0", trial: "tinted" })).toBe("tinted");
    expect(mobileSheetGlassLook({ platformOS: "ios", platformVersion: "18.4", trial: "tinted" })).toBe("opaque");
    expect(mobileSheetGlassLook({ platformOS: "android", platformVersion: 36, trial: "tinted" })).toBe("opaque");
    expect(
      mobileSheetGlassLook({ platformOS: "ios", platformVersion: "27.0", trial: "tinted", customBackground: true }),
    ).toBe("opaque");
    expect(mobileSheetGlassLook({ platformOS: "ios", platformVersion: "27.0", trial: "off" })).toBe("opaque");
  });
});
