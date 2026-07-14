import { describe, expect, test } from "bun:test";
import { coerceMobileNativeSearchText } from "./mobileNativeSearchText";

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
