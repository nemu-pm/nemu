import { describe, expect, test } from "bun:test";
import { isMobileHeaderActionDisabled } from "./mobileHeaderActions";

describe("mobile header actions", () => {
  test("treats loading header actions as disabled", () => {
    expect(isMobileHeaderActionDisabled({})).toBe(false);
    expect(isMobileHeaderActionDisabled({ disabled: false, loading: false })).toBe(
      false,
    );
    expect(isMobileHeaderActionDisabled({ disabled: true })).toBe(true);
    expect(isMobileHeaderActionDisabled({ loading: true })).toBe(true);
    expect(isMobileHeaderActionDisabled({ disabled: true, loading: true })).toBe(
      true,
    );
  });
});
