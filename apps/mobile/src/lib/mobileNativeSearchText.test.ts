import { describe, expect, test } from "bun:test";
import {
  coerceMobileNativeSearchText,
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
