/**
 * Pure model for the reader's Plugins sheet (ReaderPluginSettingsSheet):
 * the SF Symbol for each plugin, the row's secondary line, and the plugin's
 * settings schema resolved into native Form sections and rows. The iOS sheet
 * renders these rows with SwiftUI controls; a kind it has no control for
 * becomes a read-only row that still names the setting and its value, so no
 * setting is dropped silently.
 */
import type { SourcePackageSetting } from "@/data/schema";
import { formatMobileSettingsCount, type MobileStrings } from "./mobileI18n";
import type { MobileReaderPlugin } from "./mobileReaderPlugins";
import {
  countRenderableSourceSettings,
  describeSourceSettingValue,
  formatSourceSettingSliderValue,
  getSourceSegmentIndex,
  getSourceSegmentOptions,
  getSourceSettingOptions,
  getSourceSettingValue,
  isRenderableSourceSetting,
  isSourceSettingVisible,
} from "./mobileSourceSettings";

export type MobileReaderPluginSystemImage =
  | "character.book.closed.ja"
  | "book.pages"
  | "puzzlepiece.extension";

/** The SF Symbol standing in for a plugin's Ionicons glyph on iOS. */
export function mobileReaderPluginSystemImage(
  plugin: Pick<MobileReaderPlugin, "id" | "icon">,
): MobileReaderPluginSystemImage {
  if (plugin.id === "japanese-learning") return "character.book.closed.ja";
  if (plugin.id === "dual-reader") return "book.pages";
  if (plugin.icon === "language-outline") return "character.book.closed.ja";
  if (plugin.icon === "copy-outline") return "book.pages";
  return "puzzlepiece.extension";
}

/** The row's secondary line, in sentence case: "5 settings", "1 setting". */
export function mobileReaderPluginRowSubtitle(
  plugin: Pick<MobileReaderPlugin, "settings">,
  strings: MobileStrings,
): string {
  return formatMobileSettingsCount(
    countRenderableSourceSettings(plugin.settings),
    strings,
  );
}

type MobileReaderPluginNativeRowBase = {
  /** Stable React key (the setting key, or its position for keyless rows). */
  id: string;
  setting: SourcePackageSetting;
  title: string;
  subtitle?: string;
};

export type MobileReaderPluginNativePickerOption = {
  label: string;
  value: string | number;
};

export type MobileReaderPluginNativeNumberRow = MobileReaderPluginNativeRowBase & {
  kind: "slider" | "stepper";
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
};

export type MobileReaderPluginNativeRow =
  | (MobileReaderPluginNativeRowBase & { kind: "toggle"; value: boolean })
  | (MobileReaderPluginNativeRowBase & {
      kind: "picker";
      options: MobileReaderPluginNativePickerOption[];
      selection: string | number;
      /**
       * How a picked option is stored: the option value itself (`select`),
       * its index (`segment`), or a one-item list (single `multi-select`).
       */
      encoding: "value" | "index" | "single-item-list";
    })
  | MobileReaderPluginNativeNumberRow
  | (MobileReaderPluginNativeRowBase & {
      kind: "readonly";
      /** The current value, when the setting carries one. */
      valueText: string | null;
    });

export type MobileReaderPluginNativeSection = {
  key: string;
  title?: string;
  footer?: string;
  rows: MobileReaderPluginNativeRow[];
};

export type MobileReaderPluginNativeRowKind = MobileReaderPluginNativeRow["kind"];

const CONTAINER_TYPES = new Set(["group", "page"]);
const VALUELESS_TYPES = new Set(["button", "link", "login"]);
const MAX_SECTION_DEPTH = 4;

/**
 * Which native control a setting kind renders as. `group` / `page` are
 * containers (sections), not rows, and return null.
 */
export function mobileReaderPluginNativeRowKind(
  setting: SourcePackageSetting,
): MobileReaderPluginNativeRowKind | null {
  if (CONTAINER_TYPES.has(setting.type)) return null;
  if (typeof setting.key !== "string" || setting.key.length === 0) {
    return "readonly";
  }
  switch (setting.type) {
    case "switch":
      return "toggle";
    case "select":
      return getSourceSettingOptions(setting).length > 0 ? "picker" : "readonly";
    case "segment":
      return getSourceSegmentOptions(setting).length > 0 ? "picker" : "readonly";
    case "multi-select":
      return setting.single && getSourceSettingOptions(setting).length > 0
        ? "picker"
        : "readonly";
    case "slider":
      // The shared settings card draws a formatted slider as a slider and a
      // bare numeric range as a stepper; mirror it.
      return typeof setting.formatValue === "function" ? "slider" : "stepper";
    default:
      return "readonly";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numericValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
  fallback: number,
): number {
  const value = getSourceSettingValue(setting, values);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildRow(
  setting: SourcePackageSetting,
  id: string,
  values: Record<string, unknown>,
  strings: MobileStrings,
): MobileReaderPluginNativeRow | null {
  const kind = mobileReaderPluginNativeRowKind(setting);
  if (!kind) return null;
  const base: MobileReaderPluginNativeRowBase = {
    id,
    setting,
    title: setting.title,
    ...(setting.subtitle ? { subtitle: setting.subtitle } : null),
  };
  switch (kind) {
    case "toggle":
      return {
        ...base,
        kind,
        value: getSourceSettingValue(setting, values) === true,
      };
    case "picker": {
      if (setting.type === "segment") {
        return {
          ...base,
          kind,
          options: getSourceSegmentOptions(setting),
          selection: getSourceSegmentIndex(setting, values),
          encoding: "index",
        };
      }
      const options = getSourceSettingOptions(setting);
      const raw = getSourceSettingValue(setting, values);
      const current = Array.isArray(raw) ? raw[0] : raw;
      const selection = options.some((option) => option.value === current)
        ? (current as string)
        : options[0]!.value;
      return {
        ...base,
        kind,
        options,
        selection,
        encoding: setting.type === "multi-select" ? "single-item-list" : "value",
      };
    }
    case "slider":
    case "stepper": {
      const min = setting.min ?? 0;
      const max = Math.max(min, setting.max ?? 100);
      const step = setting.step && setting.step > 0 ? setting.step : 1;
      const value = clamp(numericValue(setting, values, min), min, max);
      return {
        ...base,
        kind,
        min,
        max,
        step,
        value,
        valueLabel:
          kind === "slider"
            ? formatSourceSettingSliderValue(setting, value)
            : String(value),
      };
    }
    case "readonly":
      return {
        ...base,
        kind,
        valueText: VALUELESS_TYPES.has(setting.type)
          ? null
          : describeSourceSettingValue(setting, values, strings),
      };
  }
}

/**
 * The plugin's settings as Form sections: every `group` / `page` becomes a
 * titled section (with its footer), consecutive loose rows share an untitled
 * one. Rows hidden by `requires` / `requiresFalse` for the current values are
 * left out, exactly as the shared settings card hides them.
 */
export function buildMobileReaderPluginNativeSections(
  settings: SourcePackageSetting[],
  values: Record<string, unknown>,
  strings: MobileStrings,
): MobileReaderPluginNativeSection[] {
  const sections: MobileReaderPluginNativeSection[] = [];

  const visit = (
    items: readonly SourcePackageSetting[],
    path: string,
    depth: number,
    header: { title?: string; footer?: string } | null,
  ) => {
    let current: MobileReaderPluginNativeSection | null = null;
    let headerUsed = false;
    items.forEach((setting, index) => {
      if (!setting || typeof setting !== "object") return;
      if (!isRenderableSourceSetting(setting)) return;
      if (!isSourceSettingVisible(setting, values)) return;
      const id = `${path}${typeof setting.key === "string" && setting.key ? setting.key : `#${index}`}`;
      if (CONTAINER_TYPES.has(setting.type)) {
        // A nested container starts its own section; loose rows after it
        // continue in a fresh, untitled one.
        current = null;
        if (depth < MAX_SECTION_DEPTH) {
          visit(
            Array.isArray(setting.items) ? setting.items : [],
            `${id}/`,
            depth + 1,
            {
              ...(setting.title ? { title: setting.title } : null),
              ...(setting.footer ? { footer: setting.footer } : null),
            },
          );
        }
        return;
      }
      const row = buildRow(setting, id, values, strings);
      if (!row) return;
      if (!current) {
        current = {
          key: `${id}:section`,
          ...(header && !headerUsed ? header : null),
          rows: [],
        };
        headerUsed = true;
        sections.push(current);
      }
      current.rows.push(row);
    });
  };

  visit(Array.isArray(settings) ? settings : [], "", 0, null);
  return sections;
}

/** The value a native picker's selection is written back as. */
export function encodeMobileReaderPluginPickerSelection(
  row: Extract<MobileReaderPluginNativeRow, { kind: "picker" }>,
  selection: string | number,
): unknown {
  if (row.encoding === "single-item-list") return [String(selection)];
  if (row.encoding === "index") {
    return typeof selection === "number" ? selection : Number(selection);
  }
  return selection;
}

/** A slider / stepper value snapped to the row's step and range. */
export function snapMobileReaderPluginNumber(
  row: MobileReaderPluginNativeNumberRow,
  value: number,
): number {
  if (!Number.isFinite(value)) return row.value;
  const snapped = Math.round((value - row.min) / row.step) * row.step + row.min;
  return Number(clamp(snapped, row.min, row.max).toPrecision(15));
}
