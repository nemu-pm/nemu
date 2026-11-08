import { describe, expect, test } from "bun:test";
import {
  mobileReaderHexColor,
  mobileReaderPageBackgroundColor,
  mobileReaderPageBackgroundIsLight,
  normalizeMobileReaderPageBackground,
} from "./mobileReaderPageBackground";

describe("page background", () => {
  test("white by default (never chosen, or unknown); a stored choice stays; the page's border colour once measured", () => {
    expect(normalizeMobileReaderPageBackground(undefined)).toBe("white");
    expect(normalizeMobileReaderPageBackground(null)).toBe("white");
    expect(normalizeMobileReaderPageBackground("sepia")).toBe("white");
    expect(normalizeMobileReaderPageBackground(3)).toBe("white");
    // An explicit Black is kept: no migration rewrites it.
    expect(normalizeMobileReaderPageBackground("black")).toBe("black");
    expect(normalizeMobileReaderPageBackground("white")).toBe("white");
    expect(normalizeMobileReaderPageBackground("page")).toBe("page");
    expect(mobileReaderPageBackgroundColor("black", "#eeeeee")).toBe("#000000");
    expect(mobileReaderPageBackgroundColor("white")).toBe("#ffffff");
    expect(mobileReaderPageBackgroundColor("page", "#F0EAD6")).toBe("#f0ead6");
    expect(mobileReaderPageBackgroundColor("page", null)).toBe("#000000");
    expect(mobileReaderPageBackgroundColor("page", "red")).toBe("#000000");
  });

  test("an unmeasured page keeps the colour on screen, never black or the default", () => {
    expect(mobileReaderPageBackgroundColor("page", null, "#FAF8F4")).toBe("#faf8f4");
    expect(mobileReaderPageBackgroundColor("page", undefined, "#121014")).toBe("#121014");
    // Its own colour, once known, wins.
    expect(mobileReaderPageBackgroundColor("page", "#ffffff", "#121014")).toBe("#ffffff");
    // Fixed choices ignore both.
    expect(mobileReaderPageBackgroundColor("white", null, "#121014")).toBe("#ffffff");
    expect(mobileReaderPageBackgroundColor("black", null, "#ffffff")).toBe("#000000");
    expect(mobileReaderHexColor("#ABCDEF")).toBe("#abcdef");
    expect(mobileReaderHexColor("abcdef")).toBeNull();
    expect(mobileReaderHexColor(null)).toBeNull();
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
