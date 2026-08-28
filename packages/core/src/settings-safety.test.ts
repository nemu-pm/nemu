import { describe, expect, test } from "bun:test";
import {
  MAX_CORE_SETTING_DEPTH,
  MAX_CORE_SETTING_NODES,
  extractCoreSettingDefaults,
  flattenCoreSettings,
  isCoreSettingVisible,
  mergeCoreSettingValues,
  type CoreSettingNode,
} from "./settings";
import {
  MAX_SETTING_FORMATTED_VALUE_LENGTH,
  formatSettingDisplayValue,
  sanitizeSettingDisplayText,
} from "./settings-display";
import {
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  sanitizeSourceSettingValues,
} from "./settings-values";

describe("core settings safety", () => {
  test("bounds deep, wide, and cyclic schemas iteratively", () => {
    const root: CoreSettingNode[] = [];
    let children = root;
    for (let index = 0; index < MAX_CORE_SETTING_DEPTH + 10; index += 1) {
      const next: CoreSettingNode[] = [];
      children.push({ key: `group-${index}`, type: "group", items: next });
      children = next;
    }
    expect(flattenCoreSettings(root)).toHaveLength(MAX_CORE_SETTING_DEPTH + 1);

    const wide = Array.from(
      { length: MAX_CORE_SETTING_NODES + 50 },
      (_, index): CoreSettingNode => ({ key: `key-${index}`, type: "text" }),
    );
    expect(flattenCoreSettings(wide)).toHaveLength(MAX_CORE_SETTING_NODES);

    const cyclic: CoreSettingNode[] = [];
    const group: CoreSettingNode = {
      key: "cycle",
      type: "group",
      items: cyclic,
    };
    cyclic.push(group);
    expect(flattenCoreSettings(cyclic)).toEqual([group]);
  });

  test("never invokes schema or persisted-value accessors", () => {
    let getterCalls = 0;
    const setting = { key: "safe", type: "text" } as CoreSettingNode;
    Object.defineProperty(setting, "default", {
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });
    const values = {};
    Object.defineProperty(values, "safe", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });

    expect(extractCoreSettingDefaults([setting])).toEqual({});
    expect(mergeCoreSettingValues([setting], values)).toEqual({});
    expect(isCoreSettingVisible(setting, values)).toBe(true);
    expect(getterCalls).toBe(0);
  });

  test("handles revoked proxies and prototype-looking keys fail closed", () => {
    const { proxy, revoke } = Proxy.revocable(
      { key: "revoked", type: "text", default: "value" },
      {},
    );
    revoke();
    expect(() => flattenCoreSettings([proxy])).not.toThrow();
    expect(extractCoreSettingDefaults([proxy])).toEqual({});

    const defaults = extractCoreSettingDefaults([
      { key: "__proto__", type: "text", default: "data" },
    ]);
    expect(Object.getPrototypeOf(defaults)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(defaults, "__proto__")?.value).toBe(
      "data",
    );
  });

  test("formats untrusted slider labels without crashing or flooding UI", async () => {
    expect(
      formatSettingDisplayValue(() => {
        throw new Error("formatter failed");
      }, 42),
    ).toBe("42");
    expect(formatSettingDisplayValue(() => 123 as never, 42)).toBe("42");
    expect(
      formatSettingDisplayValue(
        (() => Promise.reject(new Error("async formatter"))) as never,
        42,
      ),
    ).toBe("42");
    await Promise.resolve();

    const formatted = formatSettingDisplayValue(
      () => `\u202e\u0000${"x".repeat(MAX_SETTING_FORMATTED_VALUE_LENGTH * 4)}`,
      42,
    );
    expect(formatted).toBe("x".repeat(MAX_SETTING_FORMATTED_VALUE_LENGTH));
    expect(sanitizeSettingDisplayText("safe\u202etext", 100)).toBe("safetext");
  });

  test("preserves credential, timestamp, and string-list values within bounds", () => {
    const sanitized = sanitizeSourceSettingValues({
      token: "x".repeat(128 * 1_024),
      timestamp: 9_999_999_999_999,
      enabled: true,
      cookies: ["a=1", "b=2"],
      "account:oauth-state": "state",
    });
    expect(sanitized).toEqual({
      token: "x".repeat(128 * 1_024),
      timestamp: 9_999_999_999_999,
      enabled: true,
      cookies: ["a=1", "b=2"],
      "account:oauth-state": "state",
    });
  });

  test("drops nested, cyclic, accessor, non-finite, and oversized values", () => {
    let getterCalls = 0;
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const input: Record<string, unknown> = {
      nested: { secret: "no" },
      cyclic,
      nan: Number.NaN,
      infinite: Number.POSITIVE_INFINITY,
      tooLong: "x".repeat(MAX_SOURCE_SETTING_VALUE_STRING_LENGTH + 1),
      tooWide: Array.from(
        { length: MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS + 1 },
        () => "x",
      ),
      mixed: ["safe", 1],
      safe: "yes",
    };
    Object.defineProperty(input, "accessor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });

    expect(sanitizeSourceSettingValues(input)).toEqual({ safe: "yes" });
    expect(getterCalls).toBe(0);

    const revoked = Proxy.revocable({ safe: "no" }, {});
    revoked.revoke();
    expect(() => sanitizeSourceSettingValues(revoked.proxy)).not.toThrow();
    expect(sanitizeSourceSettingValues(revoked.proxy)).toEqual({});
  });
});
