import { describe, expect, test } from "bun:test";
import {
  coerceMobileNativeSearchText,
  getMobileTextFieldTrailingAccessoryMargin,
  getMobileSearchFieldTrailingAccessories,
  resolveMobileNativeSearchSubmitText,
} from "./mobileNativeSearchText";

describe("coerceMobileNativeSearchText", () => {
  test("preserves strings from native search events", () => {
    expect(coerceMobileNativeSearchText("One Piece")).toBe("One Piece");
    expect(coerceMobileNativeSearchText("")).toBe("");
  });

  test("maps omitted or malformed native event values to an empty query", () => {
    expect(coerceMobileNativeSearchText(undefined)).toBe("");
    expect(coerceMobileNativeSearchText(null)).toBe("");
    expect(coerceMobileNativeSearchText({ text: "unexpected" })).toBe("");
  });
});

describe("resolveMobileNativeSearchSubmitText", () => {
  test("uses the search-button event text when native supplies it", () => {
    expect(resolveMobileNativeSearchSubmitText("Naruto", "stale")).toBe(
      "Naruto",
    );
    expect(resolveMobileNativeSearchSubmitText("", "stale")).toBe("");
  });

  test("uses the synchronous input ref when blur omits event text", () => {
    expect(resolveMobileNativeSearchSubmitText(undefined, "Chainsaw")).toBe(
      "Chainsaw",
    );
  });
});

describe("getMobileSearchFieldTrailingAccessories", () => {
  test("keeps the clear action at the physical trailing edge while loading", () => {
    expect(
      getMobileSearchFieldTrailingAccessories({ loading: true, canClear: true }),
    ).toEqual(["loading", "clear"]);
  });

  test("omits absent accessories without inserting layout placeholders", () => {
    expect(
      getMobileSearchFieldTrailingAccessories({ loading: false, canClear: true }),
    ).toEqual(["clear"]);
    expect(
      getMobileSearchFieldTrailingAccessories({ loading: true, canClear: false }),
    ).toEqual(["loading"]);
    expect(
      getMobileSearchFieldTrailingAccessories({ loading: false, canClear: false }),
    ).toEqual([]);
  });
});

describe("getMobileTextFieldTrailingAccessoryMargin", () => {
  test("cancels the containing field's trailing padding", () => {
    expect(getMobileTextFieldTrailingAccessoryMargin(14)).toBe(-14);
    expect(getMobileTextFieldTrailingAccessoryMargin(12)).toBe(-12);
  });

  test("does not turn missing or invalid insets into unsafe layout values", () => {
    expect(getMobileTextFieldTrailingAccessoryMargin(undefined)).toBe(0);
    expect(getMobileTextFieldTrailingAccessoryMargin(Number.NaN)).toBe(0);
    expect(getMobileTextFieldTrailingAccessoryMargin(-8)).toBe(0);
  });
});
