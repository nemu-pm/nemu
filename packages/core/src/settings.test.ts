import { describe, expect, test } from "bun:test";
import {
  countCoreSettings,
  extractCoreSettingDefaults,
  flattenCoreSettings,
  getCoreSettingKeys,
  isCoreSettingVisible,
  MAX_CORE_SETTING_DEPTH,
  MAX_CORE_SETTING_NODES,
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
    expect(
      isCoreSettingVisible({ type: "switch", requires: "toString" }, {}),
    ).toBe(false);
  });

  test("counts matching settings", () => {
    expect(
      countCoreSettings(
        schema,
        (setting) => setting.type !== "group" && setting.type !== "page",
      ),
    ).toBe(4);
  });

  test("bounds hostile depth, node counts, and cycles without recursion", () => {
    const root: CoreSettingNode = { key: "root", type: "group", items: [] };
    let cursor = root;
    for (let index = 0; index < MAX_CORE_SETTING_DEPTH + 50; index += 1) {
      const child: CoreSettingNode = {
        key: `depth-${index}`,
        type: "group",
        items: [],
      };
      (cursor.items as CoreSettingNode[]).push(child);
      cursor = child;
    }
    (cursor.items as CoreSettingNode[]).push(root);

    const flattened = flattenCoreSettings([root]);
    expect(flattened).toHaveLength(MAX_CORE_SETTING_DEPTH + 1);
    expect(new Set(flattened).size).toBe(flattened.length);

    const wide = Array.from(
      { length: MAX_CORE_SETTING_NODES + 100 },
      (_, index): CoreSettingNode => ({ key: `wide-${index}` }),
    );
    expect(flattenCoreSettings(wide)).toHaveLength(MAX_CORE_SETTING_NODES);
  });

  test("bounds work for huge invalid arrays instead of eagerly stacking them", () => {
    const sparse = new Array(MAX_CORE_SETTING_NODES * 100) as CoreSettingNode[];
    sparse[MAX_CORE_SETTING_NODES * 100 - 1] = { key: "too-late" };

    expect(flattenCoreSettings(sparse)).toEqual([]);
    expect(
      flattenCoreSettings(null as unknown as readonly CoreSettingNode[]),
    ).toEqual([]);
    expect(isCoreSettingVisible(null as unknown as CoreSettingNode, {})).toBe(
      false,
    );
  });

  test("does not invoke hostile schema or value accessors", () => {
    let getterCalls = 0;
    const accessorSetting = { key: "accessor" } as CoreSettingNode;
    Object.defineProperty(accessorSetting, "items", {
      get() {
        getterCalls += 1;
        throw new Error("must not run");
      },
    });
    Object.defineProperty(accessorSetting, "default", {
      get() {
        getterCalls += 1;
        return "must not run";
      },
    });
    const accessorArray: CoreSettingNode[] = [];
    Object.defineProperty(accessorArray, "0", {
      configurable: true,
      get() {
        getterCalls += 1;
        return accessorSetting;
      },
    });
    accessorArray.length = 1;

    const values = {} as Record<string, unknown>;
    Object.defineProperty(values, "enabled", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return true;
      },
    });

    expect(flattenCoreSettings(accessorArray)).toEqual([]);
    expect(extractCoreSettingDefaults([accessorSetting])).toEqual({});
    expect(
      isCoreSettingVisible({ type: "switch", requires: "enabled" }, values),
    ).toBe(false);
    expect(mergeCoreSettingValues([], values)).toEqual({});
    expect(getterCalls).toBe(0);

    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(
      flattenCoreSettings(proxy as unknown as readonly CoreSettingNode[]),
    ).toEqual([]);
  });
});
