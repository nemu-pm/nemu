/**
 * Unified settings type definitions for Nemu
 * Used by: Aidoku sources, Tachiyomi sources, Plugins
 * 
 * This is the single source of truth for settings schemas.
 * Source-specific adapters convert their native formats to these types.
 */

export type SettingType =
  | "group"
  | "select"
  | "multi-select"
  | "switch"
  | "slider"
  | "segment"
  | "text"
  | "button"
  | "link"
  | "login"
  | "page"
  | "editable-list";

/**
 * Base interface for all setting types
 */
interface BaseSetting {
  /** Unique key for this setting (used in values object) */
  key: string;
  /** Display label */
  title: string;
  /** Setting type discriminator */
  type: SettingType;
  /** Optional subtitle/description */
  subtitle?: string;
  /** Key of another setting that must be truthy for this to show */
  requires?: string;
  /** Key of another setting that must be falsy for this to show */
  requiresFalse?: string;
  /** Feature flag that must be available for this to show (e.g., 'webgpu') */
  requiresFeature?: string;
  /** Event to fire on change (source-specific) */
  notification?: string;
  /** What to refresh when changed */
  refreshes?: ("content" | "listings" | "settings" | "filters")[];
}

/**
 * Group container for organizing related settings
 */
export interface GroupSetting {
  type: "group";
  /** Group title */
  title: string;
  /** Optional footer text */
  footer?: string;
  /** Child settings */
  items: Setting[];
  // Groups don't need key since they just organize
  key?: string;
}

/**
 * Single-select dropdown
 */
export interface SelectSetting extends BaseSetting {
  type: "select";
  /** Option values */
  values: string[];
  /** Option labels (defaults to values if not provided) */
  titles?: string[];
  /** Default selected value */
  default?: string;
}

/**
 * Multi-select with checkboxes
 */
export interface MultiSelectSetting extends BaseSetting {
  type: "multi-select";
  /** Option values */
  values: string[];
  /** Option labels */
  titles?: string[];
  /** Default selected values */
  default?: string[];
}

/**
 * Boolean toggle switch
 */
export interface SwitchSetting extends BaseSetting {
  type: "switch";
  /** Default state */
  default?: boolean;
}

/**
 * Numeric slider/stepper control
 */
export interface SliderSetting extends BaseSetting {
  type: "slider";
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment (default: 1) */
  step?: number;
  /** Format function for displaying value (e.g., add % suffix) */
  formatValue?: (value: number) => string;
  /** Default value */
  default?: number;
}

/**
 * Segmented control (horizontal button group)
 */
export interface SegmentSetting extends BaseSetting {
  type: "segment";
  /** Option values */
  values?: string[];
  /** Alternative to values (some sources use this) */
  options?: string[];
  /** Option labels */
  titles?: string[];
  /** Default selected index */
  default?: number;
}

/**
 * Text input field
 */
export interface TextSetting extends BaseSetting {
  type: "text";
  /** Placeholder text */
  placeholder?: string;
  /** Password field (mask input) */
  secure?: boolean;
  /** Default value */
  default?: string;
}

/**
 * Action button
 */
export interface ButtonSetting extends BaseSetting {
  type: "button";
  /** Action identifier */
  action?: string;
  /** Highlight destructive actions */
  destructive?: boolean;
  /** Optional confirmation title */
  confirmTitle?: string;
  /** Optional confirmation message */
  confirmMessage?: string;
}

/**
 * External link
 */
export interface LinkSetting extends BaseSetting {
  type: "link";
  /** Static URL */
  url?: string;
  /** Key of setting containing URL */
  urlKey?: string;
  /** Whether to open outside the app */
  external?: boolean;
}

/**
 * Login / authentication action
 */
export interface LoginSetting extends BaseSetting {
  type: "login";
  /** Login method used by the source */
  method?: "basic" | "web" | "oauth";
  /** Alternate label when already logged in */
  logoutTitle?: string;
  /** Static auth URL */
  url?: string;
  /** Setting key containing the auth URL */
  urlKey?: string;
  /** OAuth token endpoint */
  tokenUrl?: string;
  /** OAuth callback scheme */
  callbackScheme?: string;
  /** Enable OAuth PKCE flow */
  pkce?: boolean;
  /** Local storage keys captured by web login */
  localStorageKeys?: string[];
  /** Show email wording instead of username */
  useEmail?: boolean;
}

/**
 * Nested settings page
 */
export interface PageSetting extends BaseSetting {
  type: "page";
  /** Child settings */
  items: Setting[];
  /** Page icon */
  icon?: { type: "system" | "url"; name?: string; url?: string; color?: string };
  /** Info text */
  info?: string;
}

/**
 * Editable list of strings
 */
export interface EditableListSetting extends BaseSetting {
  type: "editable-list";
  /** Placeholder for new item input */
  placeholder?: string;
  /** Default items */
  default?: string[];
}

/**
 * Union of all setting types
 */
export type Setting =
  | GroupSetting
  | SelectSetting
  | MultiSelectSetting
  | SwitchSetting
  | SliderSetting
  | SegmentSetting
  | TextSetting
  | ButtonSetting
  | LinkSetting
  | LoginSetting
  | PageSetting
  | EditableListSetting;

/**
 * User's persisted settings values for a source/plugin
 */
export interface SettingsData {
  /** Unique identifier (e.g., sourceKey or pluginId) */
  id: string;
  /** Key-value pairs of settings */
  values: Record<string, unknown>;
  /** Last update timestamp */
  updatedAt: number;
}

/**
 * Source settings data stored in IndexedDB
 * Uses sourceKey as primary key for the object store
 */
export interface SourceSettingsData {
  sourceKey: string;
  values: Record<string, unknown>;
  updatedAt: number;
}

/**
 * Feature flags for conditional setting visibility
 */
export type FeatureFlags = Record<string, boolean>;
