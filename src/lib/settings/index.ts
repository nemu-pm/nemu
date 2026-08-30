/**
 * Unified settings system for Nemu
 *
 * Usage:
 *   import { Setting, extractDefaults, SettingsRenderer } from "@/lib/settings";
 */

// Types
export type {
  SettingType,
  Setting,
  GroupSetting,
  SelectSetting,
  MultiSelectSetting,
  SwitchSetting,
  SliderSetting,
  SegmentSetting,
  TextSetting,
  ButtonSetting,
  LinkSetting,
  LoginSetting,
  PageSetting,
  EditableListSetting,
  SettingsData,
  SourceSettingsData,
  FeatureFlags,
} from "./types";

// Schema utilities
export {
  extractDefaults,
  isSettingVisible,
  mergeWithDefaults,
  validateRequired,
  getAllKeys,
} from "./schema";

export {
  MAX_SETTING_KEY_LENGTH,
  MAX_SETTING_LIST_ITEMS,
  MAX_SETTING_OPTIONS,
  MAX_SETTING_SCHEMA_DEPTH,
  MAX_SETTING_SCHEMA_NODES,
  MAX_SETTING_SCHEMA_STRING_CHARS,
  MAX_SETTING_SLIDER_STEPS,
  MAX_SETTING_STRING_LENGTH,
  MAX_SETTING_URL_LENGTH,
  sanitizeSettingsSchema,
  sanitizeSettingsSchemaWithReport,
} from "./sanitize";
export type { SettingsSchemaSanitizationResult } from "./sanitize";

export {
  formatSettingDisplayValue,
  MAX_SETTING_FORMATTED_VALUE_LENGTH,
  sanitizeSettingDisplayText,
} from "./display";

export {
  isSafeSourceSettingValueKey,
  MAX_SOURCE_SETTING_KEYS,
  MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS,
  MAX_SOURCE_SETTING_VALUE_KEY_LENGTH,
  MAX_SOURCE_SETTING_VALUE_STRING_LENGTH,
  MAX_SOURCE_SETTING_VALUES_STRING_CHARS,
  sanitizeSourceSettingValues,
} from "./values";
export type { SanitizedSourceSettingValue } from "./values";

// Renderer
export { SettingsRenderer } from "./renderer";
export type { SettingsRendererProps } from "./renderer";
