import { describe, expect, test } from "bun:test";
import { shouldDismissMobileReaderSurfacesOnFocusChange } from "./mobileReaderFocus";

describe("reader surfaces on focus change", () => {
  test("close only when the focused reader loses focus", () => {
    expect(shouldDismissMobileReaderSurfacesOnFocusChange(true, false)).toBe(true);
    expect(shouldDismissMobileReaderSurfacesOnFocusChange(false, false)).toBe(false);
    expect(shouldDismissMobileReaderSurfacesOnFocusChange(false, true)).toBe(false);
    expect(shouldDismissMobileReaderSurfacesOnFocusChange(true, true)).toBe(false);
  });
});
