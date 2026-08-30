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
} from "@nemu/core";
import type {
  ButtonSetting,
  EditableListSetting,
  GroupSetting,
  LinkSetting,
  LoginSetting,
  MultiSelectSetting,
  PageSetting,
  SegmentSetting,
  SelectSetting,
  Setting,
  SliderSetting,
  SwitchSetting,
  TextSetting,
} from "./types";
import {
  isUnsafeSettingTextCodePoint,
  sanitizeSettingDisplayText,
} from "./display";

export const MAX_SETTING_SCHEMA_DEPTH = MAX_CORE_SETTING_DEPTH;
export const MAX_SETTING_SCHEMA_NODES = MAX_CORE_SETTING_NODES;
export const MAX_SETTING_OPTIONS = MAX_CORE_SETTING_OPTIONS;
export const MAX_SETTING_LIST_ITEMS = MAX_CORE_SETTING_LIST_ITEMS;
export const MAX_SETTING_KEY_LENGTH = MAX_CORE_SETTING_KEY_LENGTH;
export const MAX_SETTING_STRING_LENGTH = MAX_CORE_SETTING_STRING_LENGTH;
export const MAX_SETTING_URL_LENGTH = MAX_CORE_SETTING_URL_LENGTH;
export const MAX_SETTING_SCHEMA_STRING_CHARS =
  MAX_CORE_SETTING_SCHEMA_STRING_CHARS;
export const MAX_SETTING_SLIDER_STEPS = MAX_CORE_SETTING_SLIDER_STEPS;

const MAX_LOCAL_STORAGE_KEYS = 64;
const ALLOWED_TYPES = new Set([
  "group",
  "select",
  "multi-select",
  "switch",
  "slider",
  "segment",
  "text",
  "button",
  "link",
  "login",
  "page",
  "editable-list",
]);
const REFRESH_TARGETS = new Set(["content", "listings", "settings", "filters"]);

type DataRecord = Record<string, unknown>;
type RefreshTarget = "content" | "listings" | "settings" | "filters";

interface SanitizationContext {
  seen: WeakSet<object>;
  claimedKeys: Set<string>;
  remainingStringChars: number;
  inspectedNodes: number;
  acceptedNodes: number;
  droppedNodes: number;
  normalized: boolean;
  truncated: boolean;
}

interface SanitizationFrame {
  input: readonly unknown[];
  length: number;
  output: Setting[];
  index: number;
  depth: number;
  path: string;
}

interface SanitizedNode {
  setting: Setting;
  children?: readonly unknown[];
  childrenOutput?: Setting[];
}

export interface SettingsSchemaSanitizationResult {
  schema: Setting[];
  inspectedNodes: number;
  acceptedNodes: number;
  droppedNodes: number;
  normalized: boolean;
  truncated: boolean;
  hadIssues: boolean;
}

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

/** Read data properties only. Accessors from a hostile in-memory plugin are
 * ignored rather than invoked while rendering settings. */
function ownValue(record: DataRecord, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function hasUnsafeAtomicCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 0x20 ||
      codePoint === 0x7f ||
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
  maxLength = MAX_SETTING_STRING_LENGTH,
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
  maxLength = MAX_SETTING_KEY_LENGTH,
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
  maxStringLength = MAX_SETTING_STRING_LENGTH,
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
    if (item === undefined || seen?.has(item)) {
      context.normalized = true;
      continue;
    }
    seen?.add(item);
    result.push(item);
  }
  return result;
}

function takeOptions(
  context: SanitizationContext,
  record: DataRecord,
): { values: string[]; titles?: string[] } | null {
  const rawValues = asArray(
    ownValue(record, "values") ?? ownValue(record, "options"),
  );
  if (!rawValues) return null;
  const valuesLength = safeArrayLength(rawValues);
  if (valuesLength > MAX_SETTING_OPTIONS) context.truncated = true;

  const rawTitlesValue = ownValue(record, "titles");
  const rawTitles = asArray(rawTitlesValue);
  if (rawTitlesValue !== undefined && !rawTitles) context.normalized = true;
  const hasTitles = rawTitles !== null;
  if (rawTitles && safeArrayLength(rawTitles) > MAX_SETTING_OPTIONS) {
    context.truncated = true;
  }
  const values: string[] = [];
  const titles: string[] = [];
  const seenValues = new Set<string>();
  const end = Math.min(valuesLength, MAX_SETTING_OPTIONS);
  for (let index = 0; index < end; index += 1) {
    const value = takeAtomicString(
      context,
      safeArrayValue(rawValues, index),
      MAX_SETTING_STRING_LENGTH,
      true,
    );
    if (value === undefined || seenValues.has(value)) {
      context.normalized = true;
      continue;
    }
    seenValues.add(value);
    values.push(value);
    if (rawTitles) {
      const rawTitle = safeArrayValue(rawTitles, index);
      const title = takeDisplayString(context, rawTitle);
      if (title === undefined) context.normalized = true;
      titles.push(title ?? value);
    }
  }

  return hasTitles ? { values, titles } : { values };
}

function takeRefreshTargets(
  context: SanitizationContext,
  record: DataRecord,
): RefreshTarget[] | undefined {
  const rawValue = ownValue(record, "refreshes");
  const value = asArray(rawValue);
  if (!value) {
    if (rawValue !== undefined) context.normalized = true;
    return undefined;
  }
  const result: RefreshTarget[] = [];
  const length = safeArrayLength(value);
  if (length > REFRESH_TARGETS.size) context.truncated = true;
  const end = Math.min(length, REFRESH_TARGETS.size);
  for (let index = 0; index < end; index += 1) {
    const target = safeArrayValue(value, index);
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

function addOptional<T extends object, K extends PropertyKey, V>(
  target: T,
  key: K,
  value: V | undefined,
): asserts target is T & Record<K, V> {
  if (value !== undefined) {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
}

function commonFields(
  context: SanitizationContext,
  record: DataRecord,
  key: string,
  fallbackTitle: string,
) {
  const title = takeDisplayString(context, ownValue(record, "title"));
  if (title === undefined) context.normalized = true;
  const fields = {
    key,
    title: title ?? fallbackTitle,
  };
  addOptional(
    fields,
    "subtitle",
    takeDisplayString(context, ownValue(record, "subtitle")),
  );
  addOptional(
    fields,
    "requires",
    takeAtomicString(context, ownValue(record, "requires")),
  );
  addOptional(
    fields,
    "requiresFalse",
    takeAtomicString(context, ownValue(record, "requiresFalse")),
  );
  addOptional(
    fields,
    "requiresFeature",
    takeAtomicString(context, ownValue(record, "requiresFeature")),
  );
  addOptional(
    fields,
    "notification",
    takeAtomicString(context, ownValue(record, "notification")),
  );
  addOptional(fields, "refreshes", takeRefreshTargets(context, record));
  return fields;
}

function availableValueKey(
  context: SanitizationContext,
  record: DataRecord,
): string | null {
  const key = takeAtomicString(context, ownValue(record, "key"));
  return key && !context.claimedKeys.has(key) ? key : null;
}

function claimKey(context: SanitizationContext, key: string): void {
  context.claimedKeys.add(key);
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

function asCredentialFreeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_SETTING_URL_LENGTH) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}

function sanitizeGroup(
  context: SanitizationContext,
  record: DataRecord,
): SanitizedNode {
  const items: Setting[] = [];
  const group: GroupSetting = {
    type: "group",
    title: takeDisplayString(context, ownValue(record, "title")) ?? "",
    items,
  };
  const key = takeAtomicString(context, ownValue(record, "key"));
  if (key && !context.claimedKeys.has(key)) {
    group.key = key;
    claimKey(context, key);
  } else if (key) {
    context.normalized = true;
  }
  addOptional(
    group,
    "footer",
    takeDisplayString(context, ownValue(record, "footer")),
  );
  const children = asArray(ownValue(record, "items"));
  if (!children) context.normalized = true;
  return {
    setting: group,
    children: children ?? [],
    childrenOutput: items,
  };
}

function sanitizePage(
  context: SanitizationContext,
  record: DataRecord,
  path: string,
): SanitizedNode | null {
  const rawKey = takeAtomicString(context, ownValue(record, "key"));
  if (rawKey && context.claimedKeys.has(rawKey)) return null;
  if (!rawKey) context.normalized = true;
  const key = rawKey ?? syntheticKey(context, "page", path);
  claimKey(context, key);
  const items: Setting[] = [];
  const page: PageSetting = {
    ...commonFields(context, record, key, key),
    type: "page",
    items,
  };
  addOptional(
    page,
    "info",
    takeDisplayString(context, ownValue(record, "info")),
  );

  const rawIcon = ownValue(record, "icon");
  const iconRecord = asDataRecord(rawIcon);
  if (rawIcon !== undefined && !iconRecord) context.normalized = true;
  if (iconRecord) {
    const iconType = ownValue(iconRecord, "type");
    if (iconType === "system") {
      const name = takeAtomicString(context, ownValue(iconRecord, "name"));
      if (name) {
        const icon: NonNullable<PageSetting["icon"]> = {
          type: "system",
          name,
        };
        addOptional(
          icon,
          "color",
          takeAtomicString(context, ownValue(iconRecord, "color")),
        );
        page.icon = icon;
      } else {
        context.normalized = true;
      }
    } else if (iconType === "url") {
      const url = takeAtomicString(
        context,
        ownValue(iconRecord, "url"),
        MAX_SETTING_URL_LENGTH,
      );
      if (url) {
        const icon: NonNullable<PageSetting["icon"]> = {
          type: "url",
          url,
        };
        addOptional(
          icon,
          "color",
          takeAtomicString(context, ownValue(iconRecord, "color")),
        );
        page.icon = icon;
      } else {
        context.normalized = true;
      }
    } else {
      context.normalized = true;
    }
  }

  const children = asArray(ownValue(record, "items"));
  if (!children) context.normalized = true;
  return {
    setting: page,
    children: children ?? [],
    childrenOutput: items,
  };
}

function sanitizeSettingNode(
  context: SanitizationContext,
  record: DataRecord,
  path: string,
): SanitizedNode | null {
  const rawType = ownValue(record, "type");
  if (typeof rawType !== "string") return null;
  let type = rawType;
  if (type === "stepper") {
    type = "slider";
    context.normalized = true;
  } else if (type === "multi-single-select") {
    type = "multi-select";
    context.normalized = true;
  }
  if (!ALLOWED_TYPES.has(type)) return null;
  if (type === "group") return sanitizeGroup(context, record);
  if (type === "page") return sanitizePage(context, record, path);

  if (type === "button") {
    const action = takeAtomicString(context, ownValue(record, "action"));
    const rawKey = takeAtomicString(context, ownValue(record, "key"));
    if (rawKey && context.claimedKeys.has(rawKey)) return null;
    if (!rawKey) context.normalized = true;
    const key = rawKey ?? syntheticKey(context, "button", path);
    const button: ButtonSetting = {
      ...commonFields(context, record, key, action ?? key),
      type: "button",
    };
    addOptional(button, "action", action);
    // Aidoku buttons use `action`; Nemu's shared change pipeline dispatches
    // `notification`. Mirror the action so canonical sources keep working.
    if (!button.notification && action) button.notification = action;
    addOptional(
      button,
      "destructive",
      takeBoolean(context, ownValue(record, "destructive")),
    );
    addOptional(
      button,
      "confirmTitle",
      takeDisplayString(context, ownValue(record, "confirmTitle")),
    );
    addOptional(
      button,
      "confirmMessage",
      takeDisplayString(context, ownValue(record, "confirmMessage")),
    );
    claimKey(context, key);
    return { setting: button };
  }

  if (type === "link") {
    const rawKeyValue = ownValue(record, "key");
    const rawKey = takeAtomicString(context, ownValue(record, "key"));
    if (rawKey && context.claimedKeys.has(rawKey)) return null;
    if (!rawKey) context.normalized = true;
    const key = rawKey ?? syntheticKey(context, "link", path);
    const link: LinkSetting = {
      ...commonFields(context, record, key, key),
      type: "link",
    };
    const legacyKeyUrl = asCredentialFreeHttpsUrl(rawKeyValue);
    addOptional(
      link,
      "url",
      takeAtomicString(
        context,
        ownValue(record, "url") ?? legacyKeyUrl,
        MAX_SETTING_URL_LENGTH,
      ),
    );
    addOptional(
      link,
      "urlKey",
      takeAtomicString(context, ownValue(record, "urlKey")),
    );
    addOptional(
      link,
      "external",
      takeBoolean(context, ownValue(record, "external")),
    );
    claimKey(context, key);
    return { setting: link };
  }

  const key = availableValueKey(context, record);
  if (!key) return null;
  const common = commonFields(context, record, key, key);

  switch (type) {
    case "select": {
      const options = takeOptions(context, record);
      if (!options) return null;
      const setting: SelectSetting = { ...common, type, ...options };
      const defaultValue = ownValue(record, "default");
      if (
        typeof defaultValue === "string" &&
        options.values.includes(defaultValue)
      ) {
        setting.default = takeAtomicString(
          context,
          defaultValue,
          MAX_SETTING_STRING_LENGTH,
          true,
        );
      } else if (defaultValue !== undefined) {
        context.normalized = true;
      }
      claimKey(context, key);
      return { setting };
    }
    case "multi-select": {
      const options = takeOptions(context, record);
      if (!options) return null;
      const setting: MultiSelectSetting = { ...common, type, ...options };
      const singleValue = takeBoolean(context, ownValue(record, "single"));
      const single = rawType === "multi-single-select" || singleValue === true;
      addOptional(
        setting,
        "single",
        rawType === "multi-single-select" ? true : singleValue,
      );
      const defaults = takeStringList(
        context,
        ownValue(record, "default"),
        MAX_SETTING_LIST_ITEMS,
        MAX_SETTING_STRING_LENGTH,
        true,
      );
      if (defaults) {
        const supportedDefaults = defaults.filter((value) =>
          options.values.includes(value),
        );
        if (supportedDefaults.length !== defaults.length) {
          context.normalized = true;
        }
        if (single && supportedDefaults.length > 1) {
          context.normalized = true;
          setting.default = supportedDefaults.slice(0, 1);
        } else {
          setting.default = supportedDefaults;
        }
      }
      claimKey(context, key);
      return { setting };
    }
    case "switch": {
      const setting: SwitchSetting = { ...common, type };
      addOptional(
        setting,
        "default",
        takeBoolean(context, ownValue(record, "default")),
      );
      claimKey(context, key);
      return { setting };
    }
    case "slider": {
      const minimum =
        takeNumber(context, ownValue(record, "min")) ??
        takeNumber(context, ownValue(record, "minimumValue")) ??
        0;
      const maximum =
        takeNumber(context, ownValue(record, "max")) ??
        takeNumber(context, ownValue(record, "maximumValue")) ??
        100;
      const min = Math.min(minimum, maximum);
      const max = Math.max(minimum, maximum);
      if (min !== minimum || max !== maximum) context.normalized = true;
      const setting: SliderSetting = { ...common, type, min, max };
      const step =
        takeNumber(context, ownValue(record, "step")) ??
        takeNumber(context, ownValue(record, "stepValue"));
      const range = max - min;
      if (step !== undefined && step > 0 && range > 0) {
        const minimumMeaningfulStep = range / MAX_SETTING_SLIDER_STEPS;
        setting.step = Math.min(range, Math.max(step, minimumMeaningfulStep));
        if (setting.step !== step) context.normalized = true;
      } else if (step !== undefined) {
        context.normalized = true;
      }
      const defaultValue = takeNumber(context, ownValue(record, "default"));
      if (defaultValue !== undefined) {
        setting.default = Math.min(max, Math.max(min, defaultValue));
        if (setting.default !== defaultValue) context.normalized = true;
      }
      const formatValue = ownValue(record, "formatValue");
      if (typeof formatValue === "function") {
        setting.formatValue = formatValue as (value: number) => string;
      } else if (formatValue !== undefined) {
        context.normalized = true;
      }
      claimKey(context, key);
      return { setting };
    }
    case "segment": {
      const options = takeOptions(context, record);
      if (!options) return null;
      const setting: SegmentSetting = {
        ...common,
        type,
        values: options.values,
        ...(options.titles ? { titles: options.titles } : {}),
      };
      const defaultValue = ownValue(record, "default");
      if (
        typeof defaultValue === "number" &&
        Number.isInteger(defaultValue) &&
        defaultValue >= 0 &&
        defaultValue < options.values.length
      ) {
        setting.default = defaultValue;
      } else if (typeof defaultValue === "string") {
        const index = options.values.indexOf(defaultValue);
        if (index >= 0) {
          setting.default = index;
          context.normalized = true;
        } else {
          context.normalized = true;
        }
      } else if (defaultValue !== undefined) {
        context.normalized = true;
      }
      claimKey(context, key);
      return { setting };
    }
    case "text": {
      const setting: TextSetting = { ...common, type };
      addOptional(
        setting,
        "placeholder",
        takeDisplayString(context, ownValue(record, "placeholder")),
      );
      addOptional(
        setting,
        "secure",
        takeBoolean(context, ownValue(record, "secure")),
      );
      addOptional(
        setting,
        "default",
        takeDisplayString(context, ownValue(record, "default")),
      );
      claimKey(context, key);
      return { setting };
    }
    case "login": {
      const method = ownValue(record, "method");
      if (
        method !== undefined &&
        method !== "basic" &&
        method !== "web" &&
        method !== "oauth"
      ) {
        return null;
      }
      const setting: LoginSetting = { ...common, type };
      if (method) setting.method = method;
      addOptional(
        setting,
        "logoutTitle",
        takeDisplayString(context, ownValue(record, "logoutTitle")),
      );
      addOptional(
        setting,
        "url",
        takeAtomicString(
          context,
          ownValue(record, "url"),
          MAX_SETTING_URL_LENGTH,
        ),
      );
      addOptional(
        setting,
        "urlKey",
        takeAtomicString(context, ownValue(record, "urlKey")),
      );
      addOptional(
        setting,
        "tokenUrl",
        takeAtomicString(
          context,
          ownValue(record, "tokenUrl"),
          MAX_SETTING_URL_LENGTH,
        ),
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
          MAX_SETTING_KEY_LENGTH,
          true,
        ),
      );
      addOptional(
        setting,
        "useEmail",
        takeBoolean(context, ownValue(record, "useEmail")),
      );
      claimKey(context, key);
      return { setting };
    }
    case "editable-list": {
      const setting: EditableListSetting = { ...common, type };
      addOptional(
        setting,
        "placeholder",
        takeDisplayString(context, ownValue(record, "placeholder")),
      );
      addOptional(
        setting,
        "default",
        takeStringList(
          context,
          ownValue(record, "default"),
          MAX_SETTING_LIST_ITEMS,
        ),
      );
      claimKey(context, key);
      return { setting };
    }
    default:
      return null;
  }
}

export function sanitizeSettingsSchemaWithReport(
  input: unknown,
): SettingsSchemaSanitizationResult {
  const schema: Setting[] = [];
  const context: SanitizationContext = {
    seen: new WeakSet(),
    claimedKeys: new Set(),
    remainingStringChars: MAX_SETTING_SCHEMA_STRING_CHARS,
    inspectedNodes: 0,
    acceptedNodes: 0,
    droppedNodes: 0,
    normalized: false,
    truncated: false,
  };

  const root = asArray(input);
  if (!root) {
    return {
      schema,
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
      output: schema,
      index: 0,
      depth: 0,
      path: "",
    },
  ];
  while (
    stack.length > 0 &&
    context.inspectedNodes < MAX_SETTING_SCHEMA_NODES
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

    const node = sanitizeSettingNode(context, record, path);
    if (!node) {
      context.droppedNodes += 1;
      context.normalized = true;
      continue;
    }
    frame.output.push(node.setting);
    context.acceptedNodes += 1;

    if (node.children && node.childrenOutput) {
      if (frame.depth >= MAX_SETTING_SCHEMA_DEPTH) {
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
    schema,
    inspectedNodes: context.inspectedNodes,
    acceptedNodes: context.acceptedNodes,
    droppedNodes: context.droppedNodes,
    normalized: context.normalized,
    truncated: context.truncated,
    hadIssues,
  };
}

/** Convert an untrusted AIX/plugin/persisted schema into a bounded, plain-data
 * settings tree. The function never mutates its input and is idempotent. */
export function sanitizeSettingsSchema(input: unknown): Setting[] {
  return sanitizeSettingsSchemaWithReport(input).schema;
}
