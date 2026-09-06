import { describe, expect, it } from "bun:test";
import {
  getMobileChipDepthVariant,
  getMobileChipGlyphSize,
  getMobileChipTrailingGlyphSize,
  isMobileChipPressable,
  resolveMobileChipAccessibilityState,
  resolveMobileChipTrailingIcon,
} from "./mobileChipVisuals";

describe("isMobileChipPressable", () => {
  it("keeps every interactive variant pressable", () => {
    expect(isMobileChipPressable("toggle")).toBe(true);
    expect(isMobileChipPressable("menu")).toBe(true);
    expect(isMobileChipPressable("icon")).toBe(true);
  });

  it("renders a static chip as a plain surface", () => {
    expect(isMobileChipPressable("static")).toBe(false);
  });
});

describe("getMobileChipDepthVariant", () => {
  it("floats a selected chip on the primary surface", () => {
    expect(getMobileChipDepthVariant(true)).toBe("chip-selected");
  });

  it("recesses an unselected chip into the well", () => {
    expect(getMobileChipDepthVariant(false)).toBe("chip");
  });
});

describe("chip glyph sizes", () => {
  it("shrinks both glyphs for the sm tag chip", () => {
    expect(getMobileChipGlyphSize("sm")).toBeLessThan(
      getMobileChipGlyphSize("md"),
    );
    expect(getMobileChipTrailingGlyphSize("sm")).toBeLessThan(
      getMobileChipTrailingGlyphSize("md"),
    );
  });

  it("keeps the trailing glyph smaller than the leading one", () => {
    for (const size of ["md", "sm"] as const) {
      expect(getMobileChipTrailingGlyphSize(size)).toBeLessThan(
        getMobileChipGlyphSize(size),
      );
    }
  });
});

describe("resolveMobileChipTrailingIcon", () => {
  it("defaults a menu chip to a chevron", () => {
    expect(resolveMobileChipTrailingIcon({ variant: "menu" })).toBe(
      "chevron-down",
    );
  });

  it("leaves other variants without a trailing glyph", () => {
    expect(resolveMobileChipTrailingIcon({ variant: "toggle" })).toBeUndefined();
    expect(resolveMobileChipTrailingIcon({ variant: "static" })).toBeUndefined();
  });

  it("lets the caller name the glyph, including on a menu chip", () => {
    expect(
      resolveMobileChipTrailingIcon({
        variant: "toggle",
        trailingIcon: "close",
      }),
    ).toBe("close");
    expect(
      resolveMobileChipTrailingIcon({
        variant: "menu",
        trailingIcon: "close",
      }),
    ).toBe("close");
  });
});

describe("resolveMobileChipAccessibilityState", () => {
  it("reports checked for checkbox and radio chips", () => {
    for (const accessibilityRole of ["checkbox", "radio"] as const) {
      expect(
        resolveMobileChipAccessibilityState({
          accessibilityRole,
          disabled: false,
          selected: true,
        }),
      ).toEqual({ checked: true, disabled: false });
    }
  });

  it("reports selected for button and tab chips", () => {
    for (const accessibilityRole of ["button", "tab"] as const) {
      expect(
        resolveMobileChipAccessibilityState({
          accessibilityRole,
          disabled: true,
          selected: false,
        }),
      ).toEqual({ selected: false, disabled: true });
    }
  });

  it("never overrides a caller-supplied state", () => {
    expect(
      resolveMobileChipAccessibilityState({
        accessibilityRole: "button",
        accessibilityState: { checked: true },
        disabled: false,
        selected: false,
      }),
    ).toEqual({ checked: true });
  });
});
