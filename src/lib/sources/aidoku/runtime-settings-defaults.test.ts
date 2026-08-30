import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractSettingsDefaults } from "../../../../node_modules/@nemu.pm/aidoku-runtime/dist/async/common.js";
import {
  MAX_ABSOLUTE_CORE_SETTING_NUMBER,
  MAX_CORE_SETTING_DEPTH,
  MAX_CORE_SETTING_KEY_LENGTH,
  MAX_CORE_SETTING_LIST_ITEMS,
  MAX_CORE_SETTING_NODES,
  MAX_CORE_SETTING_STRING_LENGTH,
} from "@nemu/core";

const runtimeAsyncDirectory = path.resolve(
  import.meta.dir,
  "../../../../node_modules/@nemu.pm/aidoku-runtime/dist/async",
);

function settingsDefaults(input: unknown): Record<string, unknown> {
  return extractSettingsDefaults(input);
}

function nestedSchema(groupCount: number, key: string): unknown[] {
  const root: unknown[] = [];
  let items = root;
  for (let index = 0; index < groupCount; index += 1) {
    const children: unknown[] = [];
    items.push({ type: "group", items: children });
    items = children;
  }
  items.push({ type: "text", key, default: "kept" });
  return root;
}

describe("patched Aidoku runtime settings defaults", () => {
  test("accepts only bounded type-compatible default shapes", () => {
    const defaults = settingsDefaults([
      { type: "text", key: "text", default: "reader" },
      { type: "select", key: "select", default: "en" },
      { type: "switch", key: "enabled", default: true },
      {
        type: "stepper",
        key: "count",
        minimumValue: 5,
        maximumValue: 50,
        default: 500,
      },
      { type: "segment", key: "quality", default: 1 },
      { type: "multi-select", key: "languages", default: ["en", "ja"] },
      {
        type: "multi-single-select",
        key: "single-language",
        default: ["en", "ja"],
      },
      { type: "editable-list", key: "hosts", default: ["example.test"] },
      { type: "switch", key: "wrong-switch", default: "yes" },
      { type: "segment", key: "wrong-segment", default: 1.5 },
      {
        type: "text",
        key: "huge-string",
        default: "x".repeat(MAX_CORE_SETTING_STRING_LENGTH + 1),
      },
      {
        type: "multi-select",
        key: "huge-list",
        default: new Array(MAX_CORE_SETTING_LIST_ITEMS + 1).fill("x"),
      },
      {
        type: "slider",
        key: "huge-number",
        default: MAX_ABSOLUTE_CORE_SETTING_NUMBER + 1,
      },
      {
        type: "text",
        key: "x".repeat(MAX_CORE_SETTING_KEY_LENGTH + 1),
        default: "bad key",
      },
      { type: "unknown", key: "unknown", default: "drop" },
    ]);

    expect(defaults).toEqual({
      text: "reader",
      select: "en",
      enabled: true,
      count: 50,
      quality: 1,
      languages: ["en", "ja"],
      "single-language": ["en"],
      hosts: ["example.test"],
    });
    expect(Object.getPrototypeOf(defaults)).toBeNull();
  });

  test("fails closed for non-array roots, revoked proxies, and accessors", () => {
    for (const input of [null, undefined, {}, "settings", 1]) {
      const defaults = settingsDefaults(input);
      expect(Object.keys(defaults)).toEqual([]);
      expect(Object.getPrototypeOf(defaults)).toBeNull();
    }

    let getterCalls = 0;
    const rootAccessor: unknown[] = [];
    Object.defineProperty(rootAccessor, "0", {
      get() {
        getterCalls += 1;
        return { type: "text", key: "root-accessor", default: "bad" };
      },
    });
    rootAccessor.length = 1;

    const nodeAccessor: Record<string, unknown> = { type: "text" };
    Object.defineProperty(nodeAccessor, "key", {
      get() {
        getterCalls += 1;
        return "node-accessor";
      },
    });
    Object.defineProperty(nodeAccessor, "default", {
      get() {
        getterCalls += 1;
        return "bad";
      },
    });

    const arrayDefault: string[] = [];
    Object.defineProperty(arrayDefault, "0", {
      get() {
        getterCalls += 1;
        return "bad";
      },
    });
    arrayDefault.length = 1;

    expect(settingsDefaults(rootAccessor)).toEqual({});
    expect(
      settingsDefaults([
        nodeAccessor,
        { type: "multi-select", key: "array-accessor", default: arrayDefault },
      ]),
    ).toEqual({});
    expect(getterCalls).toBe(0);

    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(() => settingsDefaults(proxy)).not.toThrow();
    expect(settingsDefaults(proxy)).toEqual({});
  });

  test("bounds depth, candidate entries, and cyclic containers", () => {
    expect(
      settingsDefaults(nestedSchema(MAX_CORE_SETTING_DEPTH, "at-depth-limit")),
    ).toEqual({ "at-depth-limit": "kept" });
    expect(
      settingsDefaults(
        nestedSchema(MAX_CORE_SETTING_DEPTH + 1, "past-depth-limit"),
      ),
    ).toEqual({});

    const cyclicRoot: unknown[] = [
      { type: "text", key: "first", default: "kept" },
    ];
    cyclicRoot.push({ type: "group", items: cyclicRoot });
    expect(settingsDefaults(cyclicRoot)).toEqual({ first: "kept" });

    const wide = Array.from(
      { length: MAX_CORE_SETTING_NODES + 1 },
      (_, index) => ({
        type: "text",
        key: `setting-${index}`,
        default: `value-${index}`,
      }),
    );
    const defaults = settingsDefaults(wide);
    expect(Object.keys(defaults)).toHaveLength(MAX_CORE_SETTING_NODES);
    expect(defaults["setting-0"]).toBe("value-0");
    expect(defaults[`setting-${MAX_CORE_SETTING_NODES - 1}`]).toBe(
      `value-${MAX_CORE_SETTING_NODES - 1}`,
    );
    expect(defaults[`setting-${MAX_CORE_SETTING_NODES}`]).toBeUndefined();
  });

  test("defines prototype-looking keys without mutating any prototype", () => {
    const protoSetting = JSON.parse(
      '{"type":"text","key":"__proto__","default":"safe-own-value"}',
    ) as unknown;
    const defaults = settingsDefaults([
      protoSetting,
      { type: "text", key: "constructor", default: "safe-constructor" },
      { type: "text", key: "toString", default: "safe-to-string" },
      { type: "text", key: "bad\u202ekey", default: "drop" },
    ]);

    expect(Object.getPrototypeOf(defaults)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(defaults, "__proto__")).toBe(
      true,
    );
    expect(defaults["__proto__"]).toBe("safe-own-value");
    const spread = { ...defaults };
    expect(Object.getPrototypeOf(spread)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(spread, "__proto__")).toBe(
      true,
    );
    const rejectedObjectPayload = settingsDefaults([
      JSON.parse(
        '{"type":"text","key":"__proto__","default":{"polluted":true}}',
      ),
    ]);
    expect(
      Object.prototype.hasOwnProperty.call(rejectedObjectPayload, "__proto__"),
    ).toBe(false);
    expect(
      (Object.prototype as { polluted?: unknown }).polluted,
    ).toBeUndefined();
    expect(defaults["bad\u202ekey"]).toBeUndefined();
  });

  test("is the shared pre-initialize extractor for browser and node runtimes", async () => {
    const [workerSource, nodeSource] = await Promise.all([
      readFile(path.join(runtimeAsyncDirectory, "worker.js"), "utf8"),
      readFile(path.join(runtimeAsyncDirectory, "index.node.js"), "utf8"),
    ]);

    expect(workerSource).toContain(
      'import { extractSettingsDefaults, applyManifestDefaults } from "./common";',
    );
    expect(workerSource).toContain(
      "this.settingsDefaults = extractSettingsDefaults(this.source.settingsJson);",
    );
    expect(
      workerSource.indexOf(
        "this.settingsDefaults = extractSettingsDefaults(this.source.settingsJson);",
      ),
    ).toBeLessThan(workerSource.indexOf("this.source.initialize();"));
    expect(nodeSource).toContain(
      'import { extractSettingsDefaults, applyManifestDefaults, createCfRetry, createAsyncWrapper, } from "./common";',
    );
    expect(nodeSource).toContain(
      "const settingsDefaults = extractSettingsDefaults(source.settingsJson);",
    );
    expect(
      nodeSource.indexOf(
        "const settingsDefaults = extractSettingsDefaults(source.settingsJson);",
      ),
    ).toBeLessThan(nodeSource.indexOf("source.initialize();"));
  });
});
