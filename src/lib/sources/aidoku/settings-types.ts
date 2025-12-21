/**
 * Aidoku source settings type definitions
 * Based on settings.json schema from .aix packages
 */

export type SettingType =
  | "group"
  | "select"
  | "multi-select"
  | "switch"
  | "stepper"
  | "segment"
  | "text"
  | "button"
  | "link"
  | "login"
  | "page"
  | "editable-list";

interface BaseSetting {
  key: string;
  title: string;
  type: SettingType;
  requires?: string; // Key of setting that must be truthy
  requiresFalse?: string; // Key of setting that must be falsy
  notification?: string; // Event to fire on change
  refreshes?: ("content" | "listings" | "settings" | "filters")[];
}

export interface GroupSetting extends BaseSetting {
  type: "group";
  footer?: string;
  items: Setting[];
}

export interface SelectSetting extends BaseSetting {
  type: "select";
  values: string[];
  titles?: string[];
  default?: string;
}

export interface MultiSelectSetting extends BaseSetting {
  type: "multi-select";
  values: string[];
  titles?: string[];
  default?: string[];
}

export interface SwitchSetting extends BaseSetting {
  type: "switch";
  subtitle?: string;
  default?: boolean;
}

export interface StepperSetting extends BaseSetting {
  type: "stepper";
  minimumValue: number;
  maximumValue: number;
  stepValue?: number;
  default?: number;
}

export interface SegmentSetting extends BaseSetting {
  type: "segment";
  values?: string[];
  options?: string[]; // Alternative to values (some sources use this)
  titles?: string[];
  default?: number; // Segment stores index, not value
}

export interface TextSetting extends BaseSetting {
  type: "text";
  placeholder?: string;
  secure?: boolean;
  default?: string;
}

export interface ButtonSetting extends BaseSetting {
  type: "button";
  action?: string;
}

export interface LinkSetting extends BaseSetting {
  type: "link";
  url?: string;
  urlKey?: string;
}

export interface LoginSetting extends BaseSetting {
  type: "login";
  method: "basic" | "oauth" | "web";
  url?: string;
  urlKey?: string;
  logoutTitle?: string;
}

export interface PageSetting extends BaseSetting {
  type: "page";
  items: Setting[];
  icon?: { type: "system" | "url"; name?: string; url?: string; color?: string };
  info?: string;
}

export interface EditableListSetting extends BaseSetting {
  type: "editable-list";
  placeholder?: string;
  default?: string[];
}

export type Setting =
  | GroupSetting
  | SelectSetting
  | MultiSelectSetting
  | SwitchSetting
  | StepperSetting
  | SegmentSetting
  | TextSetting
  | ButtonSetting
  | LinkSetting
  | LoginSetting
  | PageSetting
  | EditableListSetting;

/**
 * User's persisted settings values for a source
 */
export interface SourceSettingsData {
  sourceKey: string; // registryId:sourceId
  values: Record<string, unknown>;
  updatedAt: number;
}

/**
 * Extract default values from a settings schema
 */
export function extractDefaults(settings: Setting[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  function processItems(items: Setting[]) {
    for (const item of items) {
      if ("key" in item && item.key && "default" in item && item.default !== undefined) {
        defaults[item.key] = item.default;
      }
      if ("items" in item && item.items) {
        processItems(item.items);
      }
    }
  }

  processItems(settings);
  return defaults;
}

/**
 * Check if a setting should be visible based on requires/requiresFalse
 */
export function isSettingVisible(
  setting: Setting,
  values: Record<string, unknown>
): boolean {
  if ("requires" in setting && setting.requires) {
    if (!values[setting.requires]) return false;
  }
  if ("requiresFalse" in setting && setting.requiresFalse) {
    if (values[setting.requiresFalse]) return false;
  }
  return true;
}

