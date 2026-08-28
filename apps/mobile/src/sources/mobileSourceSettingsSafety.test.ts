import { describe, expect, test } from "bun:test";
import {
  MAX_MOBILE_SOURCE_SETTING_DEPTH,
  MAX_MOBILE_SOURCE_SETTING_NODES,
  MAX_MOBILE_SOURCE_SETTING_OPTIONS,
  MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
  parseMobileRuntimeSettingsSchema,
  sanitizeMobileSourceSettings,
  sanitizeMobileSourceSettingsWithReport,
} from "./mobileSourceSettingsSafety";

describe("mobile source settings schema safety", () => {
  test("normalizes accepted Aidoku and Android preference shapes", () => {
    const raw = [
      {
        type: "PreferenceCategory",
        key: "general",
        title: "General",
        preferences: [
          {
            type: "ListPreference",
            key: "server",
            title: "Server",
            entries: ["One", "Two"],
            entryValues: ["one", "two"],
            defaultValue: "two",
          },
          {
            type: "multi-single-select",
            key: "mirror",
            title: "Mirror",
            values: ["a", "b"],
            default: ["a", "b"],
          },
          {
            type: "SeekBarPreference",
            key: "limit",
            title: "Limit",
            minimumValue: 100,
            maximumValue: 10,
            stepValue: Number.MIN_VALUE,
            defaultValue: 1_000,
          },
        ],
      },
      {
        type: "button",
        key: "refresh",
        title: "Refresh",
        action: "reload",
      },
    ];

    const settings = sanitizeMobileSourceSettings(raw);
    expect(settings).toEqual([
      {
        type: "group",
        key: "general",
        title: "General",
        items: [
          {
            type: "select",
            key: "server",
            title: "Server",
            values: ["one", "two"],
            titles: ["One", "Two"],
            optionCount: 2,
            default: "two",
          },
          {
            type: "multi-select",
            key: "mirror",
            title: "Mirror",
            values: ["a", "b"],
            optionCount: 2,
            single: true,
            default: ["a"],
          },
          {
            type: "slider",
            key: "limit",
            title: "Limit",
            min: 10,
            max: 100,
            step: 0.00009,
            default: 100,
          },
        ],
      },
      {
        type: "button",
        key: "refresh",
        title: "Refresh",
        action: "reload",
        notification: "reload",
      },
    ]);
    expect(sanitizeMobileSourceSettings(settings)).toEqual(settings);
  });

  test("bounds depth and width without recursive overflow", () => {
    const deepRoot: unknown[] = [];
    let children = deepRoot;
    for (
      let index = 0;
      index < MAX_MOBILE_SOURCE_SETTING_DEPTH + 8;
      index += 1
    ) {
      const next: unknown[] = [];
      children.push({
        type: "group",
        key: `group-${index}`,
        title: `Group ${index}`,
        items: next,
      });
      children = next;
    }
    const deep = sanitizeMobileSourceSettingsWithReport(deepRoot);
    expect(deep.acceptedNodes).toBe(MAX_MOBILE_SOURCE_SETTING_DEPTH + 1);
    expect(deep.truncated).toBe(true);

    const wide = Array.from(
      { length: MAX_MOBILE_SOURCE_SETTING_NODES + 20 },
      (_, index) => ({
        type: "text",
        key: `key-${index}`,
        title: `Setting ${index}`,
      }),
    );
    const wideResult = sanitizeMobileSourceSettingsWithReport(wide);
    expect(wideResult.settings).toHaveLength(MAX_MOBILE_SOURCE_SETTING_NODES);
    expect(wideResult.inspectedNodes).toBe(MAX_MOBILE_SOURCE_SETTING_NODES);
    expect(wideResult.truncated).toBe(true);
  });

  test("drops cycles, inherited nodes, accessors, and revoked proxies", () => {
    const cyclicRoot: unknown[] = [];
    const cyclicGroup = {
      type: "group",
      key: "cycle",
      title: "Cycle",
      items: cyclicRoot,
    };
    cyclicRoot.push(cyclicGroup);
    expect(sanitizeMobileSourceSettings(cyclicRoot)).toEqual([
      { type: "group", key: "cycle", title: "Cycle", items: [] },
    ]);

    let getterCalls = 0;
    const accessorNode = { type: "text", key: "accessor" };
    Object.defineProperty(accessorNode, "title", {
      get() {
        getterCalls += 1;
        return "Unsafe";
      },
    });
    const accessorArray = new Array(1);
    Object.defineProperty(accessorArray, "0", {
      get() {
        getterCalls += 1;
        return accessorNode;
      },
    });
    expect(sanitizeMobileSourceSettings(accessorArray)).toEqual([]);
    expect(sanitizeMobileSourceSettings([accessorNode])).toEqual([
      { type: "text", key: "accessor", title: "accessor" },
    ]);
    expect(getterCalls).toBe(0);

    const inherited = Object.create({
      type: "text",
      key: "inherited",
      title: "Inherited",
    });
    const { proxy, revoke } = Proxy.revocable(
      { type: "text", key: "revoked", title: "Revoked" },
      {},
    );
    revoke();
    expect(() =>
      sanitizeMobileSourceSettings([inherited, proxy]),
    ).not.toThrow();
    expect(sanitizeMobileSourceSettings([inherited, proxy])).toEqual([]);

    const root = Proxy.revocable([], {});
    root.revoke();
    expect(() => sanitizeMobileSourceSettings(root.proxy)).not.toThrow();
    expect(sanitizeMobileSourceSettings(root.proxy)).toEqual([]);
  });

  test("caps strings and options while keeping prototype-looking keys as data", () => {
    const result = sanitizeMobileSourceSettings([
      {
        type: "text",
        key: "x".repeat(MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH + 1),
        title: `Safe\u202e${"t".repeat(MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH + 50)}`,
      },
      {
        type: "select",
        key: "__proto__",
        title: "Prototype",
        options: Array.from(
          { length: MAX_MOBILE_SOURCE_SETTING_OPTIONS + 20 },
          (_, index) => `option-${index}`,
        ),
        default: "option-255",
      },
    ]);

    expect(result[0]?.key).toBe("@nemu/text/0");
    expect(result[0]?.title).not.toContain("\u202e");
    expect(result[0]?.title.length).toBeLessThanOrEqual(
      MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
    );
    expect(result[1]?.key).toBe("__proto__");
    expect(result[1]?.values).toHaveLength(MAX_MOBILE_SOURCE_SETTING_OPTIONS);
    expect(result[1]?.default).toBe("option-255");
    expect(
      (Object.prototype as unknown as Record<string, unknown>).polluted,
    ).toBeUndefined();
  });

  test("enforces URL policy by purpose", () => {
    const settings = sanitizeMobileSourceSettings([
      {
        type: "link",
        key: "docs",
        title: "Docs",
        url: "http://example.com/docs",
      },
      {
        type: "link",
        key: "credentialed",
        title: "Credentialed",
        url: "https://user:pass@example.com/docs",
      },
      {
        type: "login",
        key: "account",
        title: "Account",
        url: "http://example.com/login",
        tokenUrl: "https://example.com/token",
      },
      {
        type: "page",
        key: "page",
        title: "Page",
        icon: { type: "url", url: "http://example.com/icon.png" },
        items: [],
      },
    ]);

    expect(settings[0]?.url).toBe("http://example.com/docs");
    expect(settings[1]?.url).toBeUndefined();
    expect(settings[2]?.url).toBeUndefined();
    expect(settings[2]?.tokenUrl).toBe("https://example.com/token");
    expect(settings[3]?.icon).toBeUndefined();
  });

  test("parses only bounded own runtime schema envelopes", () => {
    expect(
      parseMobileRuntimeSettingsSchema(
        JSON.stringify({
          preferences: [
            {
              type: "EditTextPreference",
              key: "token",
              title: "Token",
              defaultValue: "secret",
            },
          ],
        }),
      ),
    ).toEqual([
      {
        type: "text",
        key: "token",
        title: "Token",
        default: "secret",
      },
    ]);
    expect(parseMobileRuntimeSettingsSchema("{}")).toEqual([]);
    expect(parseMobileRuntimeSettingsSchema("not-json")).toEqual([]);
  });
});
