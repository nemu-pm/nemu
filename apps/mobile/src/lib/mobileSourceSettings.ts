import type { LocalSourceSettings, SourcePackageSetting } from "@/data/schema";
import { makeSourceKey, parseSourceKey } from "@/sources/aidokuRegistry";
import type { MobileStrings } from "./mobileI18n";
import {
  MAX_CORE_SETTING_DEPTH,
  MAX_CORE_SETTING_NODES,
  MAX_CORE_SETTING_OPTIONS,
  countCoreSettings,
  extractCoreSettingDefaults,
  flattenCoreSettings,
  formatSettingDisplayValue,
  isCoreSettingVisible,
  mergeCoreSettingValues,
  sanitizeSourceSettingValues,
} from "@nemu/core";

export type MobileSourceSettingFeatureFlags = Record<string, boolean>;

export type MobileSourceSettingsActionState = {
  loading: boolean;
  mutating: boolean;
};

export type MobileSourceSettingsReader = {
  getSourceSettings(sourceKey: string): Promise<LocalSourceSettings | null>;
};

export function makeMobileSourceKey(
  registryId: string,
  sourceId: string,
): string {
  return makeSourceKey(registryId, sourceId);
}

export function normalizeMobileSourceSettingsKeys(
  primaryKey: string | null | undefined,
  fallbackKeys: Iterable<string | null | undefined> = [],
): string[] {
  const keys = new Set<string>();
  const addKey = (key: string | null | undefined) => {
    const trimmed = key?.trim();
    if (!trimmed) return;
    keys.add(trimmed);

    const parsed = parseSourceKey(trimmed);
    if (parsed.registryId === "unknown") {
      if (parsed.sourceId !== trimmed) keys.add(parsed.sourceId);
      return;
    }
    keys.add(makeMobileSourceKey(parsed.registryId, parsed.sourceId));
  };

  addKey(primaryKey);
  for (const key of fallbackKeys) addKey(key);
  return [...keys];
}

export function getMobileSourceSettingsNavigationResetKey(
  primaryKey: string | null | undefined,
  fallbackKeys: Iterable<string | null | undefined> = [],
): string {
  return normalizeMobileSourceSettingsKeys(primaryKey, fallbackKeys).join("|");
}

export async function loadMobileSourceSettingsByKeys(
  reader: MobileSourceSettingsReader,
  sourceKeys: Iterable<string | null | undefined>,
): Promise<LocalSourceSettings | null> {
  for (const key of normalizeMobileSourceSettingsKeys(null, sourceKeys)) {
    const settings = await reader.getSourceSettings(key);
    if (settings) return settings;
  }
  return null;
}

export function isMobileSourceSettingsActionBusy(
  state: MobileSourceSettingsActionState,
): boolean {
  return state.loading || state.mutating;
}

export function canStartMobileSourceSettingsAction(
  state: MobileSourceSettingsActionState,
): boolean {
  return !isMobileSourceSettingsActionBusy(state);
}

export function canRetryMobileSourceSettingsLoadError({
  hasError,
  state,
}: {
  hasError: boolean;
  state: MobileSourceSettingsActionState;
}): boolean {
  return hasError && canStartMobileSourceSettingsAction(state);
}

export function canSelectMobileSourceSettingOption({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}

export function canRunMobileSourceTextSettingBlurFeedback({
  initialValue,
  currentValue,
  disabled,
}: {
  initialValue: string | null;
  currentValue: string;
  disabled: boolean;
}): boolean {
  return !disabled && initialValue !== null && initialValue !== currentValue;
}

export function isSourceSettingVisible(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
  features: MobileSourceSettingFeatureFlags = {},
): boolean {
  return isCoreSettingVisible(setting, values, features);
}

export function isRenderableSourceSetting(
  setting: SourcePackageSetting,
): boolean {
  return typeof ownDataValue(setting, "type") === "string";
}

export function isEditableSourceSetting(
  setting: SourcePackageSetting,
): boolean {
  const type = ownDataValue(setting, "type");
  return (
    isRenderableSourceSetting(setting) &&
    typeof type === "string" &&
    !["group", "page", "button", "link", "login"].includes(type)
  );
}

export function sourceSettingRequestsDataRefresh(
  setting: SourcePackageSetting | null | undefined,
): boolean {
  if (!setting || typeof setting !== "object") return false;
  const refreshes = asOwnArray(ownDataValue(setting, "refreshes"));
  return refreshes !== null && safeOwnArrayLength(refreshes) > 0;
}

export function sourceSettingsRequestDataRefresh(
  settings: SourcePackageSetting[],
): boolean {
  return flattenSourceSettings(settings)
    .filter(isEditableSourceSetting)
    .some(sourceSettingRequestsDataRefresh);
}

export function flattenSourceSettings(
  settings: SourcePackageSetting[],
): SourcePackageSetting[] {
  return flattenCoreSettings(
    settings,
    (setting) => setting.type !== "group" && setting.type !== "page",
  );
}

export function flattenVisibleEditableSourceSettings(
  settings: SourcePackageSetting[],
  values: Record<string, unknown>,
  features: MobileSourceSettingFeatureFlags = {},
): SourcePackageSetting[] {
  const flattened: SourcePackageSetting[] = [];

  walkVisibleSourceSettings(settings, values, features, (setting) => {
    if (isEditableSourceSetting(setting)) flattened.push(setting);
    return false;
  });

  return flattened;
}

export function countRenderableSourceSettings(
  settings: SourcePackageSetting[],
): number {
  return countCoreSettings(
    settings,
    (setting) =>
      setting.type !== "group" &&
      setting.type !== "page" &&
      isRenderableSourceSetting(setting),
  );
}

export function hasVisibleSourceSettingRows(
  settings: SourcePackageSetting[],
  values: Record<string, unknown>,
  features: MobileSourceSettingFeatureFlags = {},
): boolean {
  let found = false;
  walkVisibleSourceSettings(settings, values, features, (setting) => {
    if (setting.type !== "group" && isRenderableSourceSetting(setting)) {
      found = true;
      return true;
    }
    return false;
  });
  return found;
}

function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function asOwnArray(value: unknown): readonly unknown[] | null {
  try {
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function safeOwnArrayLength(value: readonly unknown[]): number {
  const length = ownDataValue(value, "length");
  return Number.isSafeInteger(length) && (length as number) >= 0
    ? (length as number)
    : 0;
}

/** Traverse source-owned schemas without invoking accessors or allowing a
 * cyclic/deep/wide tree to monopolize the settings surface. Returning true
 * from `visit` stops the walk early. */
function walkVisibleSourceSettings(
  settings: SourcePackageSetting[],
  values: Record<string, unknown>,
  features: MobileSourceSettingFeatureFlags,
  visit: (setting: SourcePackageSetting) => boolean,
): void {
  let rootIsArray = false;
  try {
    rootIsArray = Array.isArray(settings);
  } catch {
    return;
  }
  if (!rootIsArray) return;

  const seen = new WeakSet<object>();
  const rootLength = safeOwnArrayLength(settings);
  const stack: Array<{
    items: readonly unknown[];
    index: number;
    length: number;
    depth: number;
  }> = [
    {
      items: settings,
      index: 0,
      length: rootLength,
      depth: 0,
    },
  ];
  let inspected = 0;

  while (stack.length > 0 && inspected < MAX_CORE_SETTING_NODES) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.length) {
      stack.pop();
      continue;
    }
    const candidate = ownDataValue(frame.items, String(frame.index++));
    inspected += 1;
    if (!candidate || typeof candidate !== "object" || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    const setting = candidate as SourcePackageSetting;
    if (!isSourceSettingVisible(setting, values, features)) continue;
    try {
      if (visit(setting)) return;
    } catch {
      // Treat hostile accessors as a non-renderable row while still allowing
      // safe own-data descendants to be considered.
    }

    if (frame.depth >= MAX_CORE_SETTING_DEPTH) continue;
    const rawItems = ownDataValue(setting, "items");
    const items = asOwnArray(rawItems);
    if (!items) continue;
    stack.push({
      items,
      index: 0,
      length: safeOwnArrayLength(items),
      depth: frame.depth + 1,
    });
  }
}

export function extractSourceSettingDefaults(
  settings: SourcePackageSetting[],
): Record<string, unknown> {
  return sanitizeSourceSettingValues(
    extractCoreSettingDefaults(flattenSourceSettings(settings)),
  );
}

export function mergeSourceSettingValues(
  settings: SourcePackageSetting[],
  values: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return sanitizeSourceSettingValues(
    mergeCoreSettingValues(
      flattenSourceSettings(settings),
      sanitizeSourceSettingValues(values),
    ),
  );
}

export function applyMobileSourceSettingChange(
  settings: SourcePackageSetting[],
  userValues: Record<string, unknown> | null | undefined,
  key: string,
  value: unknown,
): {
  values: Record<string, unknown>;
  userValues: Record<string, unknown>;
} {
  return applyMobileSourceSettingsPatch(settings, userValues, { [key]: value });
}

export function applyMobileSourceSettingsPatch(
  settings: SourcePackageSetting[],
  userValues: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  deleteKeys: Iterable<string> = [],
): {
  values: Record<string, unknown>;
  userValues: Record<string, unknown>;
} {
  const nextUserValues = sanitizeSourceSettingValues(userValues);
  const safePatch = sanitizeSourceSettingValues(patch);
  for (const key of Object.keys(safePatch)) {
    Object.defineProperty(nextUserValues, key, {
      value: safePatch[key],
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  for (const key of deleteKeys) delete nextUserValues[key];
  return {
    values: mergeSourceSettingValues(settings, nextUserValues),
    userValues: nextUserValues,
  };
}

export function getSourceSettingOptions(setting: SourcePackageSetting): Array<{
  label: string;
  value: string;
}> {
  const rawValues = ownDataValue(setting, "values");
  const rawTitles = ownDataValue(setting, "titles");
  const values = asOwnArray(rawValues) ?? asOwnArray(rawTitles) ?? [];
  const titles = asOwnArray(rawTitles) ?? [];
  const length = Math.min(safeOwnArrayLength(values), MAX_CORE_SETTING_OPTIONS);
  const options: Array<{ label: string; value: string }> = [];
  for (let index = 0; index < length; index += 1) {
    const rawValue = ownDataValue(values, String(index));
    if (typeof rawValue !== "string") continue;
    const rawTitle = ownDataValue(titles, String(index));
    options.push({
      value: rawValue,
      label: typeof rawTitle === "string" ? rawTitle : rawValue,
    });
  }
  return options;
}

export function getSourceSegmentOptions(setting: SourcePackageSetting): Array<{
  label: string;
  value: number;
}> {
  const rawTitles = ownDataValue(setting, "titles");
  const rawValues = ownDataValue(setting, "values");
  const labels = asOwnArray(rawTitles) ?? asOwnArray(rawValues) ?? [];
  const result: Array<{ label: string; value: number }> = [];
  const length = Math.min(safeOwnArrayLength(labels), MAX_CORE_SETTING_OPTIONS);
  for (let index = 0; index < length; index += 1) {
    const label = ownDataValue(labels, String(index));
    if (typeof label === "string") result.push({ label, value: index });
  }
  return result;
}

export function getSourceSettingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
): unknown {
  const key = ownDataValue(setting, "key");
  const value = typeof key === "string" ? ownDataValue(values, key) : undefined;
  return value ?? ownDataValue(setting, "default");
}

export function formatSourceSettingSliderValue(
  setting: SourcePackageSetting,
  value: number,
): string {
  const formatter = ownDataValue(setting, "formatValue");
  return formatSettingDisplayValue(
    typeof formatter === "function"
      ? (formatter as (value: number) => unknown)
      : undefined,
    value,
  );
}

export function getSourceSegmentIndex(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
): number {
  const value = getSourceSettingValue(setting, values);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isInteger(numeric)) return numeric;
    const options = getSourceSettingOptions(setting);
    const valueIndex = options.findIndex((option) => option.value === value);
    if (valueIndex >= 0) return valueIndex;
    const titleIndex = options.findIndex((option) => option.label === value);
    if (titleIndex >= 0) return titleIndex;
  }
  return 0;
}

export function describeSourceSettingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
  strings: MobileStrings,
): string {
  const value = getSourceSettingValue(setting, values);
  if (ownDataValue(setting, "type") === "segment") {
    const selectedIndex = getSourceSegmentIndex(setting, values);
    return (
      getSourceSegmentOptions(setting)[selectedIndex]?.label ??
      String(selectedIndex)
    );
  }
  const listValue = asOwnArray(value);
  if (listValue) {
    const items: string[] = [];
    const length = Math.min(
      safeOwnArrayLength(listValue),
      MAX_CORE_SETTING_OPTIONS,
    );
    for (let index = 0; index < length; index += 1) {
      const item = ownDataValue(listValue, String(index));
      if (typeof item === "string") items.push(item);
    }
    if (!items.length) return strings.settings.sourceSettingsNone;
    const options = getSourceSettingOptions(setting);
    return items
      .map(
        (item) =>
          options.find((option) => option.value === item)?.label ?? item,
      )
      .join(", ");
  }
  if (typeof value === "boolean") {
    return value
      ? strings.settings.sourceSettingsOn
      : strings.settings.sourceSettingsOff;
  }
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean") ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    return strings.settings.sourceSettingsDefaultValue;
  }

  const options = getSourceSettingOptions(setting);
  return (
    options.find((option) => option.value === value)?.label ?? String(value)
  );
}

export function formatSourceSettingAccessibilityLabel(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
  strings: MobileStrings,
  label?: string,
): string {
  const value = describeSourceSettingValue(setting, values, strings);
  const rawTitle = ownDataValue(setting, "title");
  const effectiveLabel =
    label ?? (typeof rawTitle === "string" ? rawTitle : "");
  const rawSubtitle = ownDataValue(setting, "subtitle");
  const subtitle = typeof rawSubtitle === "string" ? rawSubtitle : undefined;
  const detailParts =
    subtitle && subtitle !== value ? [subtitle, value] : [value];
  return [effectiveLabel.trim(), ...detailParts.map((part) => part.trim())]
    .filter(Boolean)
    .join(", ");
}
