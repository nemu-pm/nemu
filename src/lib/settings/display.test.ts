import { describe, expect, test } from "bun:test";
import {
  formatSettingDisplayValue,
  MAX_SETTING_FORMATTED_VALUE_LENGTH,
  sanitizeSettingDisplayText,
} from "./display";

describe("settings display safety", () => {
  test("falls back when a formatter throws or returns a non-string", async () => {
    expect(
      formatSettingDisplayValue(() => {
        throw new Error("broken formatter");
      }, 42),
    ).toBe("42");
    expect(formatSettingDisplayValue(() => ({ value: "42" }), 42)).toBe("42");
    expect(
      formatSettingDisplayValue(async () => {
        throw new Error("async formatters are unsupported");
      }, 42),
    ).toBe("42");
    await Promise.resolve();
  });

  test("bounds and sanitizes formatter output", () => {
    expect(formatSettingDisplayValue(() => "x".repeat(10_000), 1)).toBe(
      "x".repeat(MAX_SETTING_FORMATTED_VALUE_LENGTH),
    );
    expect(
      formatSettingDisplayValue(
        () => "safe\u0000\u001b[31m\u202eevil\u2066text",
        1,
      ),
    ).toBe("safe[31meviltext");
  });

  test("keeps ordinary whitespace but removes spoofing controls", () => {
    expect(sanitizeSettingDisplayText("Line 1\nLine 2\t✓", 100)).toBe(
      "Line 1\nLine 2\t✓",
    );
    expect(sanitizeSettingDisplayText("a\u200fb\u202dc\u2069d", 100)).toBe(
      "abcd",
    );
    expect(sanitizeSettingDisplayText("a\u0085b\u200bc\ufeffd", 100)).toBe(
      "abcd",
    );
    expect(sanitizeSettingDisplayText("😀", 1)).toBe("");
  });
});
