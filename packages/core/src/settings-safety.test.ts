import { describe, expect, test } from "bun:test";
import {
  formatSettingDisplayValue,
  MAX_SETTING_FORMATTED_VALUE_LENGTH,
  sanitizeSettingDisplayText,
} from "./settings-display";
import {
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  sanitizeSourceSettingValues,
} from "./settings-values";

describe("shared settings safety", () => {
  test("contains unsafe formatter output", async () => {
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
    expect(formatSettingDisplayValue(() => "x".repeat(10_000), 1)).toBe(
      "x".repeat(MAX_SETTING_FORMATTED_VALUE_LENGTH),
    );
    expect(sanitizeSettingDisplayText("safe\u0000\u202eevil", 100)).toBe(
      "safeevil",
    );
    expect(sanitizeSettingDisplayText("safe\u0085\u200b\ufefftext", 100)).toBe(
      "safetext",
    );
    expect(sanitizeSettingDisplayText("😀", 1)).toBe("");
  });

  test("keeps only bounded persisted setting value shapes", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(
      sanitizeSourceSettingValues({
        enabled: true,
        count: 4,
        timestamp: 2_000_000_000_000,
        token: "secret",
        cookies: ["sid", "abc"],
        cyclic,
        infinite: Number.POSITIVE_INFINITY,
        huge: "x".repeat(MAX_SOURCE_SETTING_VALUE_STRING_LENGTH + 1),
        tooMany: new Array(MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS + 1).fill("x"),
      }),
    ).toEqual({
      enabled: true,
      count: 4,
      timestamp: 2_000_000_000_000,
      token: "secret",
      cookies: ["sid", "abc"],
    });
  });
});
