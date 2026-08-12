import type { LocalSourceSettings, SourcePackageSetting } from "@/data/schema";
import { makeSourceKey, parseSourceKey } from "@/sources/aidokuRegistry";
import type { MobileStrings } from "./mobileI18n";
import {
  countCoreSettings,
  extractCoreSettingDefaults,
  flattenCoreSettings,
  isCoreSettingVisible,
  mergeCoreSettingValues,
} from "@nemu/core";

export type MobileSourceSettingFeatureFlags = Record<string, boolean>;

export type MobileSourceSettingsActionState = {
  loading: boolean;
  mutating: boolean;
};

export type MobileSourceSettingsReader = {
  getSourceSettings(sourceKey: string): Promise<LocalSourceSettings | null>;
};

export function makeMobileSourceKey(registryId: string, sourceId: string): string {
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

export function isRenderableSourceSetting(setting: SourcePackageSetting): boolean {
  return Boolean(setting.type);
}

export function isEditableSourceSetting(setting: SourcePackageSetting): boolean {
  return (
    isRenderableSourceSetting(setting) &&
    !["group", "page", "button", "link", "login"].includes(setting.type)
  );
}

export function sourceSettingRequestsDataRefresh(
  setting: SourcePackageSetting | null | undefined
): boolean {
  return Boolean(setting?.refreshes?.length);
}

export function sourceSettingsRequestDataRefresh(
  settings: SourcePackageSetting[],
): boolean {
  return flattenSourceSettings(settings)
    .filter(isEditableSourceSetting)
    .some(sourceSettingRequestsDataRefresh);
}

export function flattenSourceSettings(settings: SourcePackageSetting[]): SourcePackageSetting[] {
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

  for (const setting of settings) {
    if (!isSourceSettingVisible(setting, values, features)) continue;
    if (isEditableSourceSetting(setting)) {
      flattened.push(setting);
    }
    if (setting.items?.length) {
      flattened.push(
        ...flattenVisibleEditableSourceSettings(setting.items, values, features),
      );
    }
  }

  return flattened;
}

export function countRenderableSourceSettings(settings: SourcePackageSetting[]): number {
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
  return settings.some((setting) => {
    if (!isSourceSettingVisible(setting, values, features)) return false;
    if (setting.type === "group") {
      return setting.items
        ? hasVisibleSourceSettingRows(setting.items, values, features)
        : false;
    }
    if (setting.type === "page") {
      return isRenderableSourceSetting(setting);
    }
    return isRenderableSourceSetting(setting);
  });
}

export function extractSourceSettingDefaults(
  settings: SourcePackageSetting[]
): Record<string, unknown> {
  return extractCoreSettingDefaults(flattenSourceSettings(settings));
}

export function mergeSourceSettingValues(
  settings: SourcePackageSetting[],
  values: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  return mergeCoreSettingValues(flattenSourceSettings(settings), values);
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
  return applyMobileSourceSettingsPatch(
    settings,
    userValues,
    { [key]: value },
  );
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
  const nextUserValues = { ...(userValues ?? {}), ...patch };
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
  const values = setting.values ?? setting.titles ?? [];
  return values.map((value, index) => ({
    value,
    label: setting.titles?.[index] ?? value,
  }));
}

export function getSourceSegmentOptions(setting: SourcePackageSetting): Array<{
  label: string;
  value: number;
}> {
  const labels = setting.titles ?? setting.values ?? [];
  return labels.map((label, index) => ({
    label,
    value: index,
  }));
}

export function getSourceSettingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>
): unknown {
  return values[setting.key] ?? setting.default;
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
    const valuesIndex = setting.values?.indexOf(value) ?? -1;
    if (valuesIndex >= 0) return valuesIndex;
    const titlesIndex = setting.titles?.indexOf(value) ?? -1;
    if (titlesIndex >= 0) return titlesIndex;
  }
  return 0;
}

export function describeSourceSettingValue(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
  strings: MobileStrings,
): string {
  const value = getSourceSettingValue(setting, values);
  if (setting.type === "segment") {
    const selectedIndex = getSourceSegmentIndex(setting, values);
    return getSourceSegmentOptions(setting)[selectedIndex]?.label ?? String(selectedIndex);
  }
  if (Array.isArray(value)) {
    if (!value.length) return strings.settings.sourceSettingsNone;
    const options = getSourceSettingOptions(setting);
    return value
      .map((item) => options.find((option) => option.value === item)?.label ?? String(item))
      .join(", ");
  }
  if (typeof value === "boolean") {
    return value
      ? strings.settings.sourceSettingsOn
      : strings.settings.sourceSettingsOff;
  }
  if (value === undefined || value === null || value === "") {
    return strings.settings.sourceSettingsDefaultValue;
  }

  const options = getSourceSettingOptions(setting);
  return options.find((option) => option.value === value)?.label ?? String(value);
}

export function formatSourceSettingAccessibilityLabel(
  setting: SourcePackageSetting,
  values: Record<string, unknown>,
  strings: MobileStrings,
  label: string = setting.title,
): string {
  const value = describeSourceSettingValue(setting, values, strings);
  const detailParts = setting.subtitle && setting.subtitle !== value
    ? [setting.subtitle, value]
    : [value];
  return [label.trim(), ...detailParts.map((part) => part.trim())]
    .filter(Boolean)
    .join(", ");
}
