import { describe, expect, test } from "bun:test";
import type { SourcePackageSetting } from "@/data/schema";
import { getMobileStrings } from "./mobileI18n";
import {
  buildMobileReaderPluginNativeSections,
  encodeMobileReaderPluginPickerSelection,
  mobileReaderPluginNativeRowKind,
  mobileReaderPluginRowSubtitle,
  mobileReaderPluginSystemImage,
  snapMobileReaderPluginNumber,
  type MobileReaderPluginNativeNumberRow,
  type MobileReaderPluginNativeRow,
} from "./mobileReaderPluginSheet";
import { getMobileReaderPluginStates } from "./mobileReaderPlugins";

const en = getMobileStrings("en");

function pluginStates() {
  return getMobileReaderPluginStates({ installedSources: [] }, en);
}

function plugin(id: string) {
  const found = pluginStates().find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing plugin ${id}`);
  return found;
}

describe("reader plugin sheet rows", () => {
  test("maps each built-in plugin to an SF Symbol", () => {
    expect(mobileReaderPluginSystemImage(plugin("japanese-learning"))).toBe(
      "character.book.closed.ja",
    );
    expect(mobileReaderPluginSystemImage(plugin("dual-reader"))).toBe("book.pages");
    expect(
      mobileReaderPluginSystemImage({ id: "other" as never, icon: "copy-outline" }),
    ).toBe("book.pages");
    expect(
      mobileReaderPluginSystemImage({ id: "other" as never, icon: "unknown" as never }),
    ).toBe("puzzlepiece.extension");
  });

  test("the secondary line is a sentence-case settings count", () => {
    expect(mobileReaderPluginRowSubtitle(plugin("japanese-learning"), en)).toBe(
      "5 settings",
    );
    expect(mobileReaderPluginRowSubtitle(plugin("dual-reader"), en)).toBe(
      "1 setting",
    );
    expect(
      mobileReaderPluginRowSubtitle(plugin("dual-reader"), getMobileStrings("zh")),
    ).toBe("1 项设置");
  });
});

describe("reader plugin native settings", () => {
  test("Japanese Learning renders every setting natively, grouped", () => {
    const japanese = plugin("japanese-learning");
    const sections = buildMobileReaderPluginNativeSections(
      japanese.settings,
      japanese.values,
      en,
    );

    expect(sections.map((section) => section.title)).toEqual([
      en.reader.pluginJapaneseLearningDetection,
      en.reader.pluginJapaneseLearningNemuChat,
    ]);
    expect(
      sections.flatMap((section) =>
        section.rows.map((row) => [row.setting.key, row.kind]),
      ),
    ).toEqual([
      ["autoDetect", "toggle"],
      ["enableForAllLanguages", "toggle"],
      ["minConfidence", "slider"],
      ["recognitionEngine", "picker"],
      ["nemuResponseMode", "picker"],
    ]);

    const [detection] = sections;
    const slider = detection!.rows[2] as MobileReaderPluginNativeNumberRow;
    expect(slider).toMatchObject({ min: 10, max: 90, step: 5, value: 25, valueLabel: "25%" });
    const engine = detection!.rows[3] as Extract<
      MobileReaderPluginNativeRow,
      { kind: "picker" }
    >;
    expect(engine.selection).toBe("auto");
    expect(engine.options.map((option) => option.value)).toEqual([
      "auto",
      "onDevice",
      "cloud",
    ]);
    expect(engine.options[1]!.label).toBe(en.reader.pluginValueEngineOnDevice);
  });

  test("Dual Read renders its debug switch", () => {
    const dual = plugin("dual-reader");
    const sections = buildMobileReaderPluginNativeSections(dual.settings, dual.values, en);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.rows).toMatchObject([
      { kind: "toggle", value: false, title: en.reader.pluginDualReadDebugOverlay },
    ]);
  });

  test("reflects stored values", () => {
    const japanese = plugin("japanese-learning");
    const sections = buildMobileReaderPluginNativeSections(
      japanese.settings,
      { ...japanese.values, autoDetect: true, minConfidence: 60, recognitionEngine: "cloud" },
      en,
    );
    const rows = sections.flatMap((section) => section.rows);
    expect(rows[0]).toMatchObject({ kind: "toggle", value: true });
    expect(rows[2]).toMatchObject({ kind: "slider", value: 60, valueLabel: "60%" });
    expect(rows[3]).toMatchObject({ kind: "picker", selection: "cloud" });
  });

  test("never drops a setting it has no control for, and honours requires", () => {
    const settings: SourcePackageSetting[] = [
      { key: "name", title: "Name", type: "text", default: "nemu" },
      { key: "gated", title: "Gated", type: "switch", requires: "enabled" },
      { key: "enabled", title: "Enabled", type: "switch", default: false },
      {
        key: "page",
        title: "Advanced",
        type: "page",
        footer: "Advanced options",
        items: [
          { key: "tags", title: "Tags", type: "multi-select", values: ["a", "b"] },
          { key: "one", title: "One", type: "multi-select", single: true, values: ["a", "b"] },
          { key: "count", title: "Count", type: "slider", min: 1, max: 5 },
          { key: "mode", title: "Mode", type: "segment", titles: ["Fast", "Slow"], default: 1 },
          { key: "open", title: "Open", type: "button" },
        ],
      },
    ];
    const sections = buildMobileReaderPluginNativeSections(settings, {}, en);

    expect(sections).toHaveLength(2);
    expect(sections[0]!.title).toBeUndefined();
    expect(sections[0]!.rows.map((row) => [row.setting.key, row.kind])).toEqual([
      ["name", "readonly"],
      ["enabled", "toggle"],
    ]);
    expect(sections[0]!.rows[0]).toMatchObject({ valueText: "nemu" });
    expect(sections[1]).toMatchObject({ title: "Advanced", footer: "Advanced options" });
    expect(sections[1]!.rows.map((row) => [row.setting.key, row.kind])).toEqual([
      ["tags", "readonly"],
      ["one", "picker"],
      ["count", "stepper"],
      ["mode", "picker"],
      ["open", "readonly"],
    ]);
    expect(sections[1]!.rows[4]).toMatchObject({ valueText: null });

    const gated = buildMobileReaderPluginNativeSections(settings, { enabled: true }, en);
    expect(gated[0]!.rows.map((row) => row.setting.key)).toEqual(["name", "gated", "enabled"]);
  });

  test("row kinds for containers and keyless rows", () => {
    expect(mobileReaderPluginNativeRowKind({ key: "g", title: "G", type: "group" })).toBeNull();
    expect(mobileReaderPluginNativeRowKind({ key: "", title: "S", type: "switch" })).toBe(
      "readonly",
    );
    expect(mobileReaderPluginNativeRowKind({ key: "s", title: "S", type: "select" })).toBe(
      "readonly",
    );
  });

  test("encodes picker selections the way the setting stores them", () => {
    const settings: SourcePackageSetting[] = [
      { key: "select", title: "Select", type: "select", values: ["x", "y"] },
      { key: "segment", title: "Segment", type: "segment", titles: ["A", "B"] },
      { key: "single", title: "Single", type: "multi-select", single: true, values: ["x", "y"] },
    ];
    const rows = buildMobileReaderPluginNativeSections(settings, {}, en)[0]!.rows as Array<
      Extract<MobileReaderPluginNativeRow, { kind: "picker" }>
    >;
    expect(encodeMobileReaderPluginPickerSelection(rows[0]!, "y")).toBe("y");
    expect(encodeMobileReaderPluginPickerSelection(rows[1]!, 1)).toBe(1);
    expect(encodeMobileReaderPluginPickerSelection(rows[2]!, "y")).toEqual(["y"]);
  });

  test("snaps slider values to the step and range", () => {
    const japanese = plugin("japanese-learning");
    const slider = buildMobileReaderPluginNativeSections(japanese.settings, japanese.values, en)[0]!
      .rows[2] as MobileReaderPluginNativeNumberRow;
    expect(snapMobileReaderPluginNumber(slider, 33)).toBe(35);
    expect(snapMobileReaderPluginNumber(slider, 2)).toBe(10);
    expect(snapMobileReaderPluginNumber(slider, 200)).toBe(90);
    expect(snapMobileReaderPluginNumber(slider, Number.NaN)).toBe(25);
  });
});
