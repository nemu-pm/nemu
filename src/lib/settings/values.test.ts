import { describe, expect, test } from "bun:test";
import {
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  sanitizeSourceSettingValues,
} from "./values";

describe("source setting value sanitizer", () => {
  test("preserves supported credential and preference shapes", () => {
    const input = {
      enabled: true,
      count: 4,
      timestamp: 2_000_000_000_000,
      token: '{"access_token":"secret"}',
      "login.cookieKeys": ["sid", "theme"],
      "login.cookieValues": ["abc", "dark"],
    };

    expect(sanitizeSourceSettingValues(input)).toEqual(input);
  });

  test("drops objects, cycles, accessors, non-finite numbers, and unsafe keys", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let getterCalls = 0;
    const input: Record<string, unknown> = {
      good: "kept",
      object: { nested: true },
      cyclic,
      infinite: Number.POSITIVE_INFINITY,
      "bad\u202ekey": "spoofed",
    };
    Object.defineProperty(input, "getter", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "must-not-run";
      },
    });

    expect(sanitizeSourceSettingValues(input)).toEqual({ good: "kept" });
    expect(getterCalls).toBe(0);
  });

  test("rejects oversized values and whole invalid arrays", () => {
    let getterCalls = 0;
    const accessorArray: string[] = [];
    Object.defineProperty(accessorArray, "0", {
      get() {
        getterCalls += 1;
        return "must-not-run";
      },
    });
    accessorArray.length = 1;
    expect(
      sanitizeSourceSettingValues({
        huge: "x".repeat(MAX_SOURCE_SETTING_VALUE_STRING_LENGTH + 1),
        tooMany: new Array(MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS + 1).fill("x"),
        mixed: ["cookie-name", { invalid: true }],
        accessorArray,
      }),
    ).toEqual({});
    expect(getterCalls).toBe(0);
  });
});
