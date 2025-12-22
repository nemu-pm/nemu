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

// Renderer
export { SettingsRenderer } from "./renderer";
export type { SettingsRendererProps } from "./renderer";

