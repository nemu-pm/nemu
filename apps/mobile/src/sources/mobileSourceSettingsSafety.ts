import {
  MAX_ABSOLUTE_CORE_SETTING_NUMBER,
  MAX_CORE_SETTING_DEPTH,
  MAX_CORE_SETTING_KEY_LENGTH,
  MAX_CORE_SETTING_LIST_ITEMS,
  MAX_CORE_SETTING_NODES,
  MAX_CORE_SETTING_OPTIONS,
  MAX_CORE_SETTING_SCHEMA_STRING_CHARS,
  MAX_CORE_SETTING_SLIDER_STEPS,
  MAX_CORE_SETTING_STRING_LENGTH,
  MAX_CORE_SETTING_URL_LENGTH,
  isUnsafeSettingTextCodePoint,
  sanitizeSettingDisplayText,
} from "@nemu/core";
import type { SourcePackageSetting } from "@/data/schema";

export const MAX_MOBILE_SOURCE_SETTING_DEPTH = MAX_CORE_SETTING_DEPTH;
export const MAX_MOBILE_SOURCE_SETTING_NODES = MAX_CORE_SETTING_NODES;
export const MAX_MOBILE_SOURCE_SETTING_OPTIONS = MAX_CORE_SETTING_OPTIONS;
export const MAX_MOBILE_SOURCE_SETTING_LIST_ITEMS = MAX_CORE_SETTING_LIST_ITEMS;
export const MAX_MOBILE_SOURCE_SETTING_KEY_LENGTH = MAX_CORE_SETTING_KEY_LENGTH;
export const MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH =
  MAX_CORE_SETTING_STRING_LENGTH;
export const MAX_MOBILE_SOURCE_SETTING_URL_LENGTH = MAX_CORE_SETTING_URL_LENGTH;
export const MAX_MOBILE_SOURCE_SETTING_SCHEMA_STRING_CHARS =
  MAX_CORE_SETTING_SCHEMA_STRING_CHARS;
export const MAX_MOBILE_SOURCE_SETTING_SLIDER_STEPS =
  MAX_CORE_SETTING_SLIDER_STEPS;

const MAX_LOCAL_STORAGE_KEYS = 64;
const REFRESH_TARGETS = new Set(["content", "listings", "settings", "filters"]);

type DataRecord = Record<string, unknown>;
type RefreshTarget = "content" | "listings" | "settings" | "filters";

type SanitizationContext = {
  seen: WeakSet<object>;
  claimedKeys: Set<string>;
  remainingStringChars: number;
  inspectedNodes: number;
  acceptedNodes: number;
  droppedNodes: number;
  normalized: boolean;
  truncated: boolean;
};

type SanitizationFrame = {
  input: readonly unknown[];
  length: number;
  output: SourcePackageSetting[];
  index: number;
  depth: number;
  path: string;
};

type SanitizedNode = {
  setting: SourcePackageSetting;
  children?: readonly unknown[];
  childrenOutput?: SourcePackageSetting[];
};

export type MobileSourceSettingsSanitizationResult = {
  settings: SourcePackageSetting[];
  inspectedNodes: number;
  acceptedNodes: number;
  droppedNodes: number;
  normalized: boolean;
  truncated: boolean;
  hadIssues: boolean;
};

function asArray(value: unknown): readonly unknown[] | null {
  try {
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function safeArrayLength(value: readonly unknown[]): number {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length =
      descriptor && "value" in descriptor ? descriptor.value : undefined;
    return Number.isSafeInteger(length) && length >= 0 ? length : 0;
  } catch {
    return 0;
  }
}

function safeArrayValue(value: readonly unknown[], index: number): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function asDataRecord(value: unknown): DataRecord | null {
  if (!value || typeof value !== "object" || asArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
  } catch {
    return null;
  }
  return value as DataRecord;
}

/** Read own data properties only. Package objects never need prototype or
 * accessor behavior, and invoking either would cross the untrusted boundary. */
function ownValue(record: DataRecord, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function firstOwnValue(record: DataRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = ownValue(record, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function takeFirstDisplayString(
  context: SanitizationContext,
  record: DataRecord,
  keys: readonly string[],
  maxLength = MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
): string | undefined {
  for (const key of keys) {
    const value = ownValue(record, key);
    if (value === undefined) continue;
    const result = takeDisplayString(context, value, maxLength);
    if (result !== undefined) return result;
  }
  return undefined;
}

function takeFirstAtomicString(
  context: SanitizationContext,
  record: DataRecord,
  keys: readonly string[],
  maxLength = MAX_MOBILE_SOURCE_SETTING_KEY_LENGTH,
  allowEmpty = false,
): string | undefined {
  for (const key of keys) {
    const value = ownValue(record, key);
    if (value === undefined) continue;
    const result = takeAtomicString(context, value, maxLength, allowEmpty);
    if (result !== undefined) return result;
  }
  return undefined;
}

function takeFirstBoolean(
  context: SanitizationContext,
  record: DataRecord,
  keys: readonly string[],
): boolean | undefined {
  for (const key of keys) {
    const value = ownValue(record, key);
    if (value === undefined) continue;
    const result = takeBoolean(context, value);
    if (result !== undefined) return result;
  }
  return undefined;
}

function takeFirstNumber(
  context: SanitizationContext,
  record: DataRecord,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const value = ownValue(record, key);
    if (value === undefined) continue;
    const result = takeNumber(context, value);
    if (result !== undefined) return result;
  }
  return undefined;
}

function firstArray(
  context: SanitizationContext,
  record: DataRecord,
  keys: readonly string[],
): readonly unknown[] | null {
  for (const key of keys) {
    const value = ownValue(record, key);
    if (value === undefined) continue;
    const result = asArray(value);
    if (result) return result;
    context.normalized = true;
  }
  return null;
}

function defaultCandidates(record: DataRecord): unknown[] {
  const values: unknown[] = [];
  for (const key of ["defaultValue", "default"]) {
    const value = ownValue(record, key);
    if (value !== undefined) values.push(value);
  }
  return values;
}

function hasUnsafeAtomicCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      codePoint === 0x200c ||
      codePoint === 0x200d ||
      isUnsafeSettingTextCodePoint(codePoint)
    ) {
      return true;
    }
  }
  return false;
}

function takeDisplayString(
  context: SanitizationContext,
  value: unknown,
  maxLength = MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
): string | undefined {
  if (typeof value !== "string") {
    if (value !== undefined) context.normalized = true;
    return undefined;
  }
  const effectiveMaxLength = Math.min(maxLength, context.remainingStringChars);
  if (effectiveMaxLength <= 0 && value.length > 0) {
    context.truncated = true;
    return undefined;
  }
  const result = sanitizeSettingDisplayText(value, effectiveMaxLength);
  if (result !== value) {
    context.normalized = true;
    if (value.length > effectiveMaxLength) context.truncated = true;
  }
  context.remainingStringChars -= result.length;
  return result;
}

function takeAtomicString(
  context: SanitizationContext,
  value: unknown,
  maxLength = MAX_MOBILE_SOURCE_SETTING_KEY_LENGTH,
  allowEmpty = false,
): string | undefined {
  const exceedsLimit =
    typeof value === "string" &&
    (value.length > maxLength || value.length > context.remainingStringChars);
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    value.length > context.remainingStringChars ||
    (!allowEmpty && value.trim().length === 0) ||
    hasUnsafeAtomicCharacter(value)
  ) {
    if (value !== undefined) context.normalized = true;
    if (exceedsLimit) context.truncated = true;
    return undefined;
  }
  context.remainingStringChars -= value.length;
  return value;
}

function takeBoolean(
  context: SanitizationContext,
  value: unknown,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  context.normalized = true;
  return undefined;
}

function takeNumber(
  context: SanitizationContext,
  value: unknown,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABSOLUTE_CORE_SETTING_NUMBER
  ) {
    return value;
  }
  context.normalized = true;
  return undefined;
}

function takeStringList(
  context: SanitizationContext,
  value: unknown,
  limit: number,
  maxStringLength = MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
  deduplicate = false,
): string[] | undefined {
  const input = asArray(value);
  if (!input) {
    if (value !== undefined) context.normalized = true;
    return undefined;
  }
  const length = safeArrayLength(input);
  if (length > limit) context.truncated = true;
  const result: string[] = [];
  const seen = deduplicate ? new Set<string>() : null;
  const end = Math.min(length, limit);
  for (let index = 0; index < end; index += 1) {
    const item = takeAtomicString(
      context,
      safeArrayValue(input, index),
      maxStringLength,
      true,
    );
    if (item === undefined || (seen !== null && seen.has(item))) {
      context.normalized = true;
      continue;
    }
    if (seen !== null) seen.add(item);
    result.push(item);
  }
  return result;
}

function takeOptions(
  context: SanitizationContext,
  record: DataRecord,
): { values: string[]; titles?: string[] } | null {
  const rawTitles = firstArray(context, record, [
    "titles",
    "entries",
    "labels",
  ]);
  let rawValues = firstArray(context, record, [
    "values",
    "entryValues",
    "options",
  ]);
  if (!rawValues && rawTitles) {
    rawValues = rawTitles;
    context.normalized = true;
  }
  if (!rawValues) return null;

  const valuesLength = safeArrayLength(rawValues);
  if (valuesLength > MAX_MOBILE_SOURCE_SETTING_OPTIONS) {
    context.truncated = true;
  }
  if (
    rawTitles &&
    safeArrayLength(rawTitles) > MAX_MOBILE_SOURCE_SETTING_OPTIONS
  ) {
    context.truncated = true;
  }

  const values: string[] = [];
  const titles: string[] = [];
  const seenValues = new Set<string>();
  const end = Math.min(valuesLength, MAX_MOBILE_SOURCE_SETTING_OPTIONS);
  for (let index = 0; index < end; index += 1) {
    const value = takeAtomicString(
      context,
      safeArrayValue(rawValues, index),
      MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
      true,
    );
    if (value === undefined || seenValues.has(value)) {
      context.normalized = true;
      continue;
    }
    seenValues.add(value);
    values.push(value);
    if (rawTitles) {
      const title = takeDisplayString(
        context,
        safeArrayValue(rawTitles, index),
      );
      if (title === undefined) context.normalized = true;
      titles.push(title ?? value);
    }
  }
  return rawTitles ? { values, titles } : { values };
}

function takeRefreshTargets(
  context: SanitizationContext,
  record: DataRecord,
): RefreshTarget[] | undefined {
  const rawValue = ownValue(record, "refreshes");
  const input = asArray(rawValue);
  if (!input) {
    if (rawValue !== undefined) context.normalized = true;
    return undefined;
  }
  const result: RefreshTarget[] = [];
  const length = safeArrayLength(input);
  if (length > REFRESH_TARGETS.size) context.truncated = true;
  const end = Math.min(length, REFRESH_TARGETS.size);
  for (let index = 0; index < end; index += 1) {
    const target = safeArrayValue(input, index);
    if (
      typeof target === "string" &&
      REFRESH_TARGETS.has(target) &&
      !result.includes(target as RefreshTarget)
    ) {
      result.push(target as RefreshTarget);
    } else {
      context.normalized = true;
    }
  }
  return result.length > 0 ? result : undefined;
}

function takeUrl(
  context: SanitizationContext,
  value: unknown,
  httpsOnly: boolean,
): string | undefined {
  const raw = takeAtomicString(
    context,
    value,
    MAX_MOBILE_SOURCE_SETTING_URL_LENGTH,
  );
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw.trim());
    if (
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      (httpsOnly
        ? parsed.protocol !== "https:"
        : parsed.protocol !== "https:" && parsed.protocol !== "http:")
    ) {
      context.normalized = true;
      return undefined;
    }
    const normalized = parsed.toString();
    if (normalized.length > MAX_MOBILE_SOURCE_SETTING_URL_LENGTH) {
      context.truncated = true;
      return undefined;
    }
    const addedLength = normalized.length - raw.length;
    if (addedLength > context.remainingStringChars) {
      context.truncated = true;
      return undefined;
    }
    if (addedLength > 0) context.remainingStringChars -= addedLength;
    if (normalized !== raw) context.normalized = true;
    return normalized;
  } catch {
    context.normalized = true;
    return undefined;
  }
}

function addOptional<K extends keyof SourcePackageSetting>(
  target: SourcePackageSetting,
  key: K,
  value: SourcePackageSetting[K] | undefined,
): void {
  if (value !== undefined) target[key] = value;
}

function normalizedType(
  context: SanitizationContext,
  value: unknown,
): { type: string; single: boolean } | null {
  if (typeof value !== "string") return null;
  switch (value) {
    case "PreferenceCategory":
    case "category":
      context.normalized = true;
      return { type: "group", single: false };
    case "ListPreference":
      context.normalized = true;
      return { type: "select", single: false };
    case "MultiSelectListPreference":
      context.normalized = true;
      return { type: "multi-select", single: false };
    case "multi-single-select":
      context.normalized = true;
      return { type: "multi-select", single: true };
    case "SwitchPreference":
    case "SwitchPreferenceCompat":
    case "CheckBoxPreference":
      context.normalized = true;
      return { type: "switch", single: false };
    case "EditTextPreference":
      context.normalized = true;
      return { type: "text", single: false };
    case "SeekBarPreference":
    case "stepper":
      context.normalized = true;
      return { type: "slider", single: false };
    case "PreferenceScreen":
      context.normalized = true;
      return { type: "page", single: false };
    case "group":
    case "select":
    case "multi-select":
    case "switch":
    case "slider":
    case "segment":
    case "text":
    case "button":
    case "link":
    case "login":
    case "page":
    case "editable-list":
      return { type: value, single: false };
    default:
      return null;
  }
}

function syntheticKey(
  context: SanitizationContext,
  type: string,
  path: string,
): string {
  const base = `@nemu/${type}/${path}`;
  let key = base;
  let suffix = 1;
  while (context.claimedKeys.has(key)) {
    key = `${base}/${suffix}`;
    suffix += 1;
  }
  return key;
}

function takeKey(
  context: SanitizationContext,
  record: DataRecord,
  type: string,
  path: string,
): string | null {
  const raw = takeFirstAtomicString(context, record, ["key", "id"]);
  if (raw && context.claimedKeys.has(raw)) return null;
  if (!raw) context.normalized = true;
  const key = raw ?? syntheticKey(context, type, path);
  context.claimedKeys.add(key);
  return key;
}

function takeChildren(
  context: SanitizationContext,
  record: DataRecord,
): readonly unknown[] {
  return (
    firstArray(context, record, ["items", "preferences", "children"]) ?? []
  );
}

function commonSetting(
  context: SanitizationContext,
  record: DataRecord,
  type: string,
  key: string,
): SourcePackageSetting {
  const title = takeFirstDisplayString(context, record, ["title", "name"]);
  if (title === undefined) context.normalized = true;
  const setting: SourcePackageSetting = {
    key,
    title: title ?? key,
    type,
  };
  addOptional(
    setting,
    "subtitle",
    takeFirstDisplayString(context, record, [
      "subtitle",
      "summary",
      "description",
    ]),
  );
  addOptional(
    setting,
    "requires",
    takeAtomicString(context, ownValue(record, "requires")),
  );
  addOptional(
    setting,
    "requiresFalse",
    takeAtomicString(context, ownValue(record, "requiresFalse")),
  );
  addOptional(
    setting,
    "requiresFeature",
    takeAtomicString(context, ownValue(record, "requiresFeature")),
  );
  addOptional(
    setting,
    "notification",
    takeAtomicString(context, ownValue(record, "notification")),
  );
  addOptional(setting, "refreshes", takeRefreshTargets(context, record));
  return setting;
}

function sanitizeNode(
  context: SanitizationContext,
  record: DataRecord,
  path: string,
): SanitizedNode | null {
  const normalized = normalizedType(context, ownValue(record, "type"));
  if (!normalized) return null;
  const { type } = normalized;
  const key = takeKey(context, record, type, path);
  if (!key) return null;
  const setting = commonSetting(context, record, type, key);

  if (type === "group" || type === "page") {
    const items: SourcePackageSetting[] = [];
    setting.items = items;
    if (type === "group") {
      addOptional(
        setting,
        "footer",
        takeDisplayString(context, ownValue(record, "footer")),
      );
    } else {
      addOptional(
        setting,
        "info",
        takeDisplayString(context, ownValue(record, "info")),
      );
      const rawIcon = ownValue(record, "icon");
      const icon = asDataRecord(rawIcon);
      if (rawIcon !== undefined && !icon) context.normalized = true;
      if (icon) {
        const iconType = ownValue(icon, "type");
        if (iconType === "system") {
          const name = takeAtomicString(context, ownValue(icon, "name"));
          if (name) {
            setting.icon = { type: "system", name };
            const color = takeAtomicString(context, ownValue(icon, "color"));
            if (color) setting.icon.color = color;
          } else {
            context.normalized = true;
          }
        } else if (iconType === "url") {
          const url = takeUrl(context, ownValue(icon, "url"), true);
          if (url) {
            setting.icon = { type: "url", url };
            const color = takeAtomicString(context, ownValue(icon, "color"));
            if (color) setting.icon.color = color;
          } else {
            context.normalized = true;
          }
        } else {
          context.normalized = true;
        }
      }
    }
    return {
      setting,
      children: takeChildren(context, record),
      childrenOutput: items,
    };
  }

  if (type === "button") {
    const action = takeAtomicString(context, ownValue(record, "action"));
    addOptional(setting, "action", action);
    if (!setting.notification && action) {
      setting.notification = action;
      context.normalized = true;
    }
    addOptional(
      setting,
      "destructive",
      takeBoolean(context, ownValue(record, "destructive")),
    );
    addOptional(
      setting,
      "confirmTitle",
      takeDisplayString(context, ownValue(record, "confirmTitle")),
    );
    addOptional(
      setting,
      "confirmMessage",
      takeDisplayString(context, ownValue(record, "confirmMessage")),
    );
    return { setting };
  }

  if (type === "link") {
    const explicitUrl = ownValue(record, "url");
    const legacyKey = firstOwnValue(record, ["key", "id"]);
    addOptional(
      setting,
      "url",
      takeUrl(
        context,
        explicitUrl === undefined ? legacyKey : explicitUrl,
        false,
      ),
    );
    addOptional(
      setting,
      "urlKey",
      takeAtomicString(context, ownValue(record, "urlKey")),
    );
    addOptional(
      setting,
      "external",
      takeBoolean(context, ownValue(record, "external")),
    );
    return { setting };
  }

  if (type === "login") {
    const method = ownValue(record, "method");
    if (
      method !== undefined &&
      method !== "basic" &&
      method !== "web" &&
      method !== "oauth"
    ) {
      context.claimedKeys.delete(key);
      return null;
    }
    if (method) setting.method = method;
    addOptional(
      setting,
      "logoutTitle",
      takeDisplayString(context, ownValue(record, "logoutTitle")),
    );
    addOptional(
      setting,
      "url",
      takeUrl(context, ownValue(record, "url"), true),
    );
    addOptional(
      setting,
      "urlKey",
      takeAtomicString(context, ownValue(record, "urlKey")),
    );
    addOptional(
      setting,
      "tokenUrl",
      takeUrl(context, ownValue(record, "tokenUrl"), true),
    );
    addOptional(
      setting,
      "callbackScheme",
      takeAtomicString(context, ownValue(record, "callbackScheme")),
    );
    addOptional(
      setting,
      "pkce",
      takeBoolean(context, ownValue(record, "pkce")),
    );
    addOptional(
      setting,
      "localStorageKeys",
      takeStringList(
        context,
        ownValue(record, "localStorageKeys"),
        MAX_LOCAL_STORAGE_KEYS,
        MAX_MOBILE_SOURCE_SETTING_KEY_LENGTH,
        true,
      ),
    );
    addOptional(
      setting,
      "useEmail",
      takeBoolean(context, ownValue(record, "useEmail")),
    );
    return { setting };
  }

  if (type === "select" || type === "multi-select" || type === "segment") {
    const options = takeOptions(context, record);
    if (!options || options.values.length === 0) {
      context.claimedKeys.delete(key);
      return null;
    }
    setting.values = options.values;
    setting.optionCount = options.values.length;
    if (options.titles) setting.titles = options.titles;
    const defaults = defaultCandidates(record);
    if (type === "select") {
      for (const candidate of defaults) {
        if (
          typeof candidate === "string" &&
          options.values.includes(candidate)
        ) {
          setting.default = candidate;
          break;
        }
        context.normalized = true;
      }
    } else if (type === "multi-select") {
      const explicitSingle = takeBoolean(context, ownValue(record, "single"));
      const single = normalized.single || explicitSingle === true;
      if (normalized.single || explicitSingle !== undefined) {
        setting.single = single;
      }
      let selectedDefaults: string[] | undefined;
      for (const candidate of defaults) {
        selectedDefaults = takeStringList(
          context,
          candidate,
          MAX_MOBILE_SOURCE_SETTING_LIST_ITEMS,
          MAX_MOBILE_SOURCE_SETTING_STRING_LENGTH,
          true,
        );
        if (selectedDefaults !== undefined) break;
      }
      if (selectedDefaults) {
        const supported = selectedDefaults.filter((value) =>
          options.values.includes(value),
        );
        if (supported.length !== selectedDefaults.length) {
          context.normalized = true;
        }
        if (single && supported.length > 1) {
          setting.default = supported.slice(0, 1);
          context.normalized = true;
        } else {
          setting.default = supported;
        }
      }
    } else {
      for (const candidate of defaults) {
        if (
          typeof candidate === "number" &&
          Number.isInteger(candidate) &&
          candidate >= 0 &&
          candidate < options.values.length
        ) {
          setting.default = candidate;
          break;
        }
        if (typeof candidate === "string") {
          const index = options.values.indexOf(candidate);
          if (index >= 0) {
            setting.default = index;
            context.normalized = true;
            break;
          }
        }
        context.normalized = true;
      }
    }
    return { setting };
  }

  if (type === "switch") {
    for (const candidate of defaultCandidates(record)) {
      const value = takeBoolean(context, candidate);
      if (value !== undefined) {
        setting.default = value;
        break;
      }
    }
    return { setting };
  }

  if (type === "slider") {
    const minimum =
      takeFirstNumber(context, record, ["min", "minimum", "minimumValue"]) ?? 0;
    const maximum =
      takeFirstNumber(context, record, ["max", "maximum", "maximumValue"]) ??
      100;
    const min = Math.min(minimum, maximum);
    const max = Math.max(minimum, maximum);
    if (min !== minimum || max !== maximum) context.normalized = true;
    setting.min = min;
    setting.max = max;
    const step = takeFirstNumber(context, record, ["step", "stepValue"]);
    const range = max - min;
    if (step !== undefined && step > 0 && range > 0) {
      const minimumMeaningfulStep =
        range / MAX_MOBILE_SOURCE_SETTING_SLIDER_STEPS;
      setting.step = Math.min(range, Math.max(step, minimumMeaningfulStep));
      if (setting.step !== step) context.normalized = true;
    } else if (step !== undefined) {
      context.normalized = true;
    }
    let rawDefault: number | undefined;
    for (const candidate of defaultCandidates(record)) {
      rawDefault = takeNumber(context, candidate);
      if (rawDefault !== undefined) break;
    }
    if (rawDefault !== undefined) {
      setting.default = Math.min(max, Math.max(min, rawDefault));
      if (setting.default !== rawDefault) context.normalized = true;
    }
    const formatValue = ownValue(record, "formatValue");
    if (typeof formatValue === "function") {
      setting.formatValue = formatValue as (value: number) => string;
    } else if (formatValue !== undefined) {
      context.normalized = true;
    }
    return { setting };
  }

  if (type === "text") {
    addOptional(
      setting,
      "placeholder",
      takeDisplayString(context, ownValue(record, "placeholder")),
    );
    addOptional(
      setting,
      "secure",
      takeFirstBoolean(context, record, ["secure", "password"]),
    );
    for (const candidate of defaultCandidates(record)) {
      const value = takeDisplayString(context, candidate);
      if (value !== undefined) {
        setting.default = value;
        break;
      }
    }
    return { setting };
  }

  if (type === "editable-list") {
    addOptional(
      setting,
      "placeholder",
      takeDisplayString(context, ownValue(record, "placeholder")),
    );
    for (const candidate of defaultCandidates(record)) {
      const value = takeStringList(
        context,
        candidate,
        MAX_MOBILE_SOURCE_SETTING_LIST_ITEMS,
      );
      if (value !== undefined) {
        setting.default = value;
        break;
      }
    }
    return { setting };
  }

  context.claimedKeys.delete(key);
  return null;
}

export function sanitizeMobileSourceSettingsWithReport(
  input: unknown,
): MobileSourceSettingsSanitizationResult {
  const settings: SourcePackageSetting[] = [];
  const context: SanitizationContext = {
    seen: new WeakSet<object>(),
    claimedKeys: new Set<string>(),
    remainingStringChars: MAX_MOBILE_SOURCE_SETTING_SCHEMA_STRING_CHARS,
    inspectedNodes: 0,
    acceptedNodes: 0,
    droppedNodes: 0,
    normalized: false,
    truncated: false,
  };
  const root = asArray(input);
  if (!root) {
    return {
      settings,
      inspectedNodes: 0,
      acceptedNodes: 0,
      droppedNodes: 0,
      normalized: true,
      truncated: false,
      hadIssues: true,
    };
  }

  const stack: SanitizationFrame[] = [
    {
      input: root,
      length: safeArrayLength(root),
      output: settings,
      index: 0,
      depth: 0,
      path: "",
    },
  ];
  while (
    stack.length > 0 &&
    context.inspectedNodes < MAX_MOBILE_SOURCE_SETTING_NODES
  ) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.length) {
      stack.pop();
      continue;
    }

    const index = frame.index++;
    const rawNode = safeArrayValue(frame.input, index);
    const path = frame.path ? `${frame.path}.${index}` : String(index);
    context.inspectedNodes += 1;
    const record = asDataRecord(rawNode);
    if (!record || context.seen.has(record)) {
      context.droppedNodes += 1;
      context.normalized = true;
      continue;
    }
    context.seen.add(record);

    const node = sanitizeNode(context, record, path);
    if (!node) {
      context.droppedNodes += 1;
      context.normalized = true;
      continue;
    }
    frame.output.push(node.setting);
    context.acceptedNodes += 1;
    if (node.children && node.childrenOutput) {
      if (frame.depth >= MAX_MOBILE_SOURCE_SETTING_DEPTH) {
        if (safeArrayLength(node.children) > 0) context.truncated = true;
      } else {
        stack.push({
          input: node.children,
          length: safeArrayLength(node.children),
          output: node.childrenOutput,
          index: 0,
          depth: frame.depth + 1,
          path,
        });
      }
    }
  }

  if (
    stack.some((frame) => frame.index < frame.length) ||
    context.remainingStringChars <= 0
  ) {
    context.truncated = true;
  }
  const hadIssues =
    context.normalized || context.truncated || context.droppedNodes > 0;
  return {
    settings,
    inspectedNodes: context.inspectedNodes,
    acceptedNodes: context.acceptedNodes,
    droppedNodes: context.droppedNodes,
    normalized: context.normalized,
    truncated: context.truncated,
    hadIssues,
  };
}

/** Convert AIX settings and Tachiyomi runtime preferences into one bounded,
 * plain-data mobile schema without mutating or trusting the input graph. */
export function sanitizeMobileSourceSettings(
  input: unknown,
): SourcePackageSetting[] {
  return sanitizeMobileSourceSettingsWithReport(input).settings;
}

/** Read a runtime schema envelope without allowing inherited fields to select
 * an attacker-controlled root. JSON parsing already rejects cycles; the shared
 * sanitizer still enforces all structural and content limits. */
export function parseMobileRuntimeSettingsSchema(
  schemaJson: string | null | undefined,
): SourcePackageSetting[] {
  if (!schemaJson) return [];
  try {
    const schema: unknown = JSON.parse(schemaJson);
    if (asArray(schema)) return sanitizeMobileSourceSettings(schema);
    const record = asDataRecord(schema);
    return sanitizeMobileSourceSettings(
      record
        ? firstOwnValue(record, ["preferences", "items", "settings"])
        : undefined,
    );
  } catch {
    return [];
  }
}
