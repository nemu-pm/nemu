import { describe, expect, test } from "bun:test";
import {
  MAX_CORE_SETTING_DEPTH,
  MAX_CORE_SETTING_LIST_ITEMS,
  MAX_CORE_SETTING_NODES,
  MAX_CORE_SETTING_SCHEMA_STRING_CHARS,
  MAX_CORE_SETTING_STRING_LENGTH,
} from "@nemu/core";
import { extractMobileAidokuSettingsDefaults } from "./aidokuSandboxRuntime";

describe("mobile Aidoku sandbox settings defaults", () => {
  test("extracts type-compatible canonical and Android preference defaults", () => {
    const defaults = extractMobileAidokuSettingsDefaults([
      {
        type: "PreferenceCategory",
        key: "general",
        preferences: [
          {
            type: "ListPreference",
            id: "server",
            entryValues: ["one", "two"],
            defaultValue: "two",
          },
          {
            type: "MultiSelectListPreference",
            key: "blocked",
            values: ["a", "b"],
            defaultValue: ["b"],
          },
          {
            type: "SwitchPreferenceCompat",
            key: "enabled",
            defaultValue: true,
          },
          {
            type: "SeekBarPreference",
            key: "limit",
            minimumValue: 10,
            maximumValue: 100,
            defaultValue: 1_000,
          },
        ],
      },
      {
        type: "segment",
        key: "layout",
        titles: ["Grid", "List"],
        default: "List",
      },
    ]);

    expect(defaults).toEqual({
      server: "two",
      blocked: ["b"],
      enabled: true,
      limit: 100,
      layout: 1,
    });
    expect(Object.getPrototypeOf(defaults)).toBeNull();
  });

  test("returns an empty null-prototype record for non-array roots", () => {
    for (const input of [null, undefined, {}, "[]"]) {
      const result = extractMobileAidokuSettingsDefaults(input);
      expect(Object.keys(result)).toEqual([]);
      expect(Object.getPrototypeOf(result)).toBeNull();
    }
  });

  test("bounds cyclic, deep, and wide graphs without recursion", () => {
    const cyclic: unknown[] = [];
    cyclic.push({ type: "group", key: "cycle", items: cyclic });
    expect(extractMobileAidokuSettingsDefaults(cyclic)).toEqual({});

    const deep: unknown[] = [];
    let children = deep;
    for (let index = 0; index < MAX_CORE_SETTING_DEPTH + 8; index += 1) {
      const next: unknown[] = [];
      children.push({ type: "group", key: `group-${index}`, items: next });
      children = next;
    }
    children.push({ type: "text", key: "too-deep", default: "hidden" });
    expect(extractMobileAidokuSettingsDefaults(deep)).toEqual({});

    const wide = Array.from(
      { length: MAX_CORE_SETTING_NODES + 20 },
      (_, index) => ({ type: "text", key: `key-${index}`, default: "value" }),
    );
    expect(Object.keys(extractMobileAidokuSettingsDefaults(wide))).toHaveLength(
      MAX_CORE_SETTING_NODES,
    );
  });

  test("does not invoke accessors and rejects inherited or revoked nodes", () => {
    let getterCalls = 0;
    const accessor = { type: "text", key: "accessor" };
    Object.defineProperty(accessor, "default", {
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });
    const accessorArray = new Array(1);
    Object.defineProperty(accessorArray, "0", {
      get() {
        getterCalls += 1;
        return accessor;
      },
    });
    expect(extractMobileAidokuSettingsDefaults([accessor])).toEqual({});
    expect(extractMobileAidokuSettingsDefaults(accessorArray)).toEqual({});
    expect(getterCalls).toBe(0);

    const inherited = Object.create({
      type: "text",
      key: "inherited",
      default: "unsafe",
    });
    const revoked = Proxy.revocable(
      { type: "text", key: "revoked", default: "unsafe" },
      {},
    );
    revoked.revoke();
    expect(() =>
      extractMobileAidokuSettingsDefaults([inherited, revoked.proxy]),
    ).not.toThrow();
    expect(
      extractMobileAidokuSettingsDefaults([inherited, revoked.proxy]),
    ).toEqual({});

    const root = Proxy.revocable([], {});
    root.revoke();
    expect(() => extractMobileAidokuSettingsDefaults(root.proxy)).not.toThrow();
  });

  test("treats prototype-looking keys as data and ignores duplicates", () => {
    const defaults = extractMobileAidokuSettingsDefaults([
      { type: "text", key: "__proto__", default: "safe" },
      { type: "text", key: "__proto__", default: "ignored" },
      { type: "text", key: "constructor", default: "also-safe" },
    ]);
    expect(Object.getOwnPropertyDescriptor(defaults, "__proto__")?.value).toBe(
      "safe",
    );
    expect(
      Object.getOwnPropertyDescriptor(defaults, "constructor")?.value,
    ).toBe("also-safe");
    expect(Object.getPrototypeOf(defaults)).toBeNull();
  });

  test("rejects oversized strings, lists, and option sets atomically", () => {
    const defaults = extractMobileAidokuSettingsDefaults([
      {
        type: "text",
        key: "huge",
        default: "x".repeat(MAX_CORE_SETTING_STRING_LENGTH + 1),
      },
      {
        type: "editable-list",
        key: "wide-list",
        default: Array.from(
          { length: MAX_CORE_SETTING_LIST_ITEMS + 1 },
          () => "x",
        ),
      },
      {
        type: "select",
        key: "wide-options",
        values: Array.from(
          { length: MAX_CORE_SETTING_LIST_ITEMS + 1 },
          (_, index) => `option-${index}`,
        ),
        default: "option-0",
      },
      {
        type: "multi-single-select",
        key: "single",
        values: ["a", "b"],
        default: ["a", "b"],
      },
    ]);

    expect(defaults).toEqual({ single: ["a"] });
  });

  test("enforces one cumulative schema-string budget", () => {
    const defaults = extractMobileAidokuSettingsDefaults(
      Array.from({ length: 300 }, (_, index) => ({
        type: "text",
        key: `key-${index}`,
        default: "x".repeat(MAX_CORE_SETTING_STRING_LENGTH),
      })),
    );
    const totalChars = Object.entries(defaults).reduce(
      (total, [key, value]) => total + key.length + String(value).length,
      0,
    );
    expect(totalChars).toBeLessThanOrEqual(
      MAX_CORE_SETTING_SCHEMA_STRING_CHARS,
    );
    expect(Object.keys(defaults).length).toBeLessThan(300);
  });
});
