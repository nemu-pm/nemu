import { describe, expect, test } from "bun:test";
import {
  countCoreSettings,
  extractCoreSettingDefaults,
  flattenCoreSettings,
  getCoreSettingKeys,
  isCoreSettingVisible,
  mergeCoreSettingValues,
  type CoreSettingNode,
} from "./settings";

const schema: CoreSettingNode[] = [
  {
    type: "group",
    key: "display",
    items: [
      {
        type: "switch",
        key: "enabled",
        default: true,
      },
      {
        type: "select",
        key: "mode",
        default: "auto",
        requires: "enabled",
      },
      {
        type: "slider",
        key: "debugLevel",
        default: 1,
        requiresFeature: "debug",
      },
    ],
  },
  {
    type: "page",
    key: "advanced",
    items: [
      {
        type: "switch",
        key: "simple",
        default: false,
        requiresFalse: "enabled",
      },
    ],
  },
];

describe("core settings helpers", () => {
  test("flattens settings and can omit container rows", () => {
    expect(flattenCoreSettings(schema).map((setting) => setting.key)).toEqual([
      "display",
      "enabled",
      "mode",
      "debugLevel",
      "advanced",
      "simple",
    ]);
    expect(
      flattenCoreSettings(
        schema,
        (setting) => setting.type !== "group" && setting.type !== "page",
      ).map((setting) => setting.key),
    ).toEqual(["enabled", "mode", "debugLevel", "simple"]);
  });

  test("extracts defaults and merges user values", () => {
    expect(extractCoreSettingDefaults(schema)).toEqual({
      enabled: true,
      mode: "auto",
      debugLevel: 1,
      simple: false,
    });
    expect(mergeCoreSettingValues(schema, { mode: "manual" })).toEqual({
      enabled: true,
      mode: "manual",
      debugLevel: 1,
      simple: false,
    });
  });

  test("checks visibility rules and keys", () => {
    const [, , mode, debugLevel, , simple] = flattenCoreSettings(schema);
    expect(isCoreSettingVisible(mode!, { enabled: true })).toBe(true);
    expect(isCoreSettingVisible(mode!, { enabled: false })).toBe(false);
    expect(isCoreSettingVisible(debugLevel!, {}, { debug: true })).toBe(true);
    expect(isCoreSettingVisible(debugLevel!, {}, { debug: false })).toBe(false);
    expect(isCoreSettingVisible(simple!, { enabled: false })).toBe(true);
    expect(isCoreSettingVisible(simple!, { enabled: true })).toBe(false);
    expect(getCoreSettingKeys(schema)).toEqual([
      "display",
      "enabled",
      "mode",
      "debugLevel",
      "advanced",
      "simple",
    ]);
  });

  test("counts matching settings", () => {
    expect(
      countCoreSettings(
        schema,
        (setting) => setting.type !== "group" && setting.type !== "page",
      ),
    ).toBe(4);
  });
});
