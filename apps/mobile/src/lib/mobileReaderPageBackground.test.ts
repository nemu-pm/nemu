import { describe, expect, test } from "bun:test";
import { mobileReaderPageBackgroundColor, normalizeMobileReaderPageBackground } from "./mobileReaderPageBackground";

describe("page background", () => {
  test("black by default; white; the page's border colour once measured", () => {
    expect(normalizeMobileReaderPageBackground(undefined)).toBe("black");
    expect(normalizeMobileReaderPageBackground("page")).toBe("page");
    expect(mobileReaderPageBackgroundColor("black", "#eeeeee")).toBe("#000000");
    expect(mobileReaderPageBackgroundColor("white")).toBe("#ffffff");
    expect(mobileReaderPageBackgroundColor("page", "#F0EAD6")).toBe("#f0ead6");
    expect(mobileReaderPageBackgroundColor("page", null)).toBe("#000000");
    expect(mobileReaderPageBackgroundColor("page", "red")).toBe("#000000");
  });
});
