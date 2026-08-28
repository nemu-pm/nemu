import { describe, expect, test } from "bun:test";
import { flattenCoreSettings } from "@nemu/core";
import type { Setting } from "./types";
import {
  MAX_SETTING_OPTIONS,
  MAX_SETTING_SCHEMA_DEPTH,
  MAX_SETTING_SCHEMA_NODES,
  MAX_SETTING_SLIDER_STEPS,
  MAX_SETTING_STRING_LENGTH,
  sanitizeSettingsSchema,
  sanitizeSettingsSchemaWithReport,
} from "./sanitize";

describe("settings schema sanitizer", () => {
  test("preserves supported schemas without mutating the input", () => {
    const formatValue = (value: number) => `${value}%`;
    const input: Setting[] = [
      {
        type: "group",
        key: "display-group",
        title: "Display",
        footer: "Applied immediately",
        items: [
          {
            type: "switch",
            key: "enabled",
            title: "Enabled",
            default: true,
            refreshes: ["content"],
          },
          {
            type: "select",
            key: "mode",
            title: "Mode",
            values: ["auto", "manual"],
            titles: ["Automatic", "Manual"],
            default: "auto",
            requires: "enabled",
          },
          {
            type: "slider",
            key: "scale",
            title: "Scale",
            min: 10,
            max: 200,
            step: 5,
            default: 100,
            formatValue,
          },
          {
            type: "page",
            key: "advanced",
            title: "Advanced",
            items: [
              {
                type: "editable-list",
                key: "hosts",
                title: "Hosts",
                default: ["example.test"],
              },
            ],
          },
        ],
      },
    ];

    const result = sanitizeSettingsSchemaWithReport(input);

    expect(result.hadIssues).toBe(false);
    expect(result.schema).toEqual(input);
    expect(result.schema).not.toBe(input);
    expect(result.schema[0]).not.toBe(input[0]);
    expect(input[0]?.type === "group" && input[0].items).toHaveLength(4);
  });

  test("normalizes canonical Aidoku legacy variants", () => {
    const schema = sanitizeSettingsSchema([
      {
        type: "group",
        items: [
          {
            type: "stepper",
            key: "results",
            title: "Results",
            minimumValue: 5,
            maximumValue: 50,
            stepValue: 5,
            default: 500,
          },
          {
            type: "multi-single-select",
            key: "language",
            title: "Language",
            values: ["en", "ja"],
            default: ["ja"],
          },
          {
            type: "segment",
            key: "quality",
            title: "Quality",
            values: ["low", "high"],
            default: "high",
          },
          {
            type: "button",
            title: "Refresh account",
            action: "refresh_account",
          },
          {
            type: "page",
            title: "Advanced",
            items: [],
          },
        ],
      },
    ]);

    expect(schema[0]).toMatchObject({ type: "group", title: "" });
    const items = schema[0]?.type === "group" ? schema[0].items : [];
    expect(items[0]).toMatchObject({
      type: "slider",
      min: 5,
      max: 50,
      step: 5,
      default: 50,
    });
    expect(items[1]).toMatchObject({
      type: "multi-select",
      default: ["ja"],
      single: true,
    });
    expect(items[2]).toMatchObject({ type: "segment", default: 1 });
    expect(items[3]).toMatchObject({
      type: "button",
      action: "refresh_account",
      notification: "refresh_account",
    });
    expect(items[4]).toMatchObject({
      type: "page",
      key: "@nemu/page/0.4",
      items: [],
    });
    expect(sanitizeSettingsSchema(schema)).toEqual(schema);
    expect(sanitizeSettingsSchemaWithReport(schema).hadIssues).toBe(false);
  });

  test("drops invalid nodes and duplicate keys without invoking accessors", () => {
    let getterCalls = 0;
    const accessorNode = {};
    Object.defineProperty(accessorNode, "type", {
      get() {
        getterCalls += 1;
        return "switch";
      },
    });

    const input: unknown[] = [
      { type: "switch", key: "same", title: "First", default: true },
      { type: "text", key: "same", title: "Duplicate" },
      { type: "unknown", key: "unknown", title: "Unknown" },
      null,
      accessorNode,
      new Date(),
    ];
    Object.defineProperty(input, "6", {
      get() {
        getterCalls += 1;
        return { type: "switch", key: "array-accessor" };
      },
    });
    input.length = 7;
    const result = sanitizeSettingsSchemaWithReport(input);

    expect(result.schema).toHaveLength(1);
    expect(result.schema[0]).toMatchObject({ key: "same", type: "switch" });
    expect(result.droppedNodes).toBe(6);
    expect(result.hadIssues).toBe(true);
    expect(getterCalls).toBe(0);
  });

  test("sanitizes display copy and clamps nonsensical slider ranges", () => {
    const schema = sanitizeSettingsSchema([
      {
        type: "slider",
        key: "bounded",
        title: "Safe\u0085\u202e title\u200b",
        min: 10,
        max: -10,
        step: Number.MIN_VALUE,
        default: 100,
      },
      {
        type: "slider",
        key: "one-step",
        title: "One step",
        min: 0,
        max: 10,
        step: 100,
      },
    ]);

    expect(schema[0]).toMatchObject({
      type: "slider",
      title: "Safe title",
      min: -10,
      max: 10,
      step: 20 / MAX_SETTING_SLIDER_STEPS,
      default: 10,
    });
    expect(schema[1]).toMatchObject({
      type: "slider",
      min: 0,
      max: 10,
      step: 10,
    });
  });

  test("caps depth, total nodes, option counts, and strings", () => {
    const root: Record<string, unknown> = {
      type: "group",
      title: "x".repeat(MAX_SETTING_STRING_LENGTH + 100),
      items: [],
    };
    let cursor = root;
    for (let index = 0; index < MAX_SETTING_SCHEMA_DEPTH + 20; index += 1) {
      const child: Record<string, unknown> = {
        type: "group",
        title: `Depth ${index}`,
        items: [],
      };
      (cursor.items as unknown[]).push(child);
      cursor = child;
    }
    (cursor.items as unknown[]).push(root);

    const deepResult = sanitizeSettingsSchemaWithReport([root]);
    expect(flattenCoreSettings(deepResult.schema)).toHaveLength(
      MAX_SETTING_SCHEMA_DEPTH + 1,
    );
    expect(deepResult.schema[0]).toMatchObject({
      title: "x".repeat(MAX_SETTING_STRING_LENGTH),
    });
    expect(deepResult.truncated).toBe(true);

    const wideResult = sanitizeSettingsSchemaWithReport(
      Array.from({ length: MAX_SETTING_SCHEMA_NODES + 50 }, (_, index) => ({
        type: "switch",
        key: `setting-${index}`,
        title: `Setting ${index}`,
      })),
    );
    expect(wideResult.acceptedNodes).toBe(MAX_SETTING_SCHEMA_NODES);
    expect(wideResult.truncated).toBe(true);

    const options = Array.from(
      { length: MAX_SETTING_OPTIONS + 50 },
      (_, index) => `option-${index}`,
    );
    const optionSchema = sanitizeSettingsSchema([
      {
        type: "select",
        key: "bounded-options",
        title: "Bounded",
        values: options,
      },
    ]);
    expect(
      optionSchema[0]?.type === "select" && optionSchema[0].values,
    ).toHaveLength(MAX_SETTING_OPTIONS);
  });

  test("is idempotent and returns an empty schema for invalid roots", () => {
    const once = sanitizeSettingsSchema([
      {
        type: "text",
        key: "username",
        title: "Username",
        default: "reader",
      },
    ]);

    expect(sanitizeSettingsSchema(once)).toEqual(once);
    expect(sanitizeSettingsSchema({ type: "switch" })).toEqual([]);
    expect(sanitizeSettingsSchema(null)).toEqual([]);

    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(() => sanitizeSettingsSchema(proxy)).not.toThrow();
    expect(sanitizeSettingsSchema(proxy)).toEqual([]);
  });
});
