import { describe, expect, test } from "bun:test";
import {
  mobileReaderPageBackgroundColor,
  mobileReaderPageBackgroundIsLight,
  normalizeMobileReaderPageBackground,
} from "./mobileReaderPageBackground";

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

  test("light backgrounds take dark status glyphs", () => {
    expect(mobileReaderPageBackgroundIsLight("#ffffff")).toBe(true);
    expect(mobileReaderPageBackgroundIsLight("#f0ead6")).toBe(true);
    expect(mobileReaderPageBackgroundIsLight("#000000")).toBe(false);
    expect(mobileReaderPageBackgroundIsLight("#2b2b2b")).toBe(false);
    // A dark grey margin stays dark; a sepia one is light.
    expect(mobileReaderPageBackgroundIsLight("#555555")).toBe(false);
    expect(mobileReaderPageBackgroundIsLight("#c8b89a")).toBe(true);
    expect(mobileReaderPageBackgroundIsLight("white")).toBe(false);
  });
});
