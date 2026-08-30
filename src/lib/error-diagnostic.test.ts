import { describe, expect, test } from "bun:test";
import { safeErrorCategory } from "./error-diagnostic";

describe("safeErrorCategory", () => {
  test("preserves only known non-sensitive categories", () => {
    expect(safeErrorCategory(new TypeError("secret=do-not-log"))).toBe(
      "TypeError",
    );
    expect(
      safeErrorCategory(new DOMException("private URL", "AbortError")),
    ).toBe("AbortError");
  });

  test("does not expose hostile names, messages, or coercion hooks", () => {
    const hostile = new Error("Bearer private-token");
    hostile.name = "profile-user@example.com";
    expect(safeErrorCategory(hostile)).toBe("Error");
    expect(
      safeErrorCategory({
        toString() {
          throw new Error("must not be called");
        },
      }),
    ).toBe("UnknownError");
  });
});
