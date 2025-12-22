/**
 * Settings schema utilities
 * Shared logic for extracting defaults and checking visibility
 */

import type { Setting, FeatureFlags } from "./types";

/**
 * Extract default values from a settings schema
 * Recursively processes groups and pages
 */
export function extractDefaults(settings: Setting[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  function processItems(items: Setting[]) {
    for (const item of items) {
      // Extract default if setting has key and default value
      if ("key" in item && item.key && "default" in item && item.default !== undefined) {
        defaults[item.key] = item.default;
      }
      // Recursively process nested items (groups and pages)
      if ("items" in item && item.items) {
        processItems(item.items);
      }
    }
  }

  processItems(settings);
  return defaults;
}

/**
 * Check if a setting should be visible based on conditional requirements
 * 
 * @param setting - The setting to check
 * @param values - Current settings values
 * @param features - Available feature flags (optional)
 */
export function isSettingVisible(
  setting: Setting,
  values: Record<string, unknown>,
  features: FeatureFlags = {}
): boolean {
  // Groups are always visible (their children handle their own visibility)
  if (setting.type === "group") return true;

  // Check requires - another setting must be truthy
  if ("requires" in setting && setting.requires) {
    if (!values[setting.requires]) return false;
  }

  // Check requiresFalse - another setting must be falsy
  if ("requiresFalse" in setting && setting.requiresFalse) {
    if (values[setting.requiresFalse]) return false;
  }

  // Check requiresFeature - a feature flag must be available
  if ("requiresFeature" in setting && setting.requiresFeature) {
    if (!features[setting.requiresFeature]) return false;
  }

  return true;
}

/**
 * Merge schema defaults with user values
 * User values take precedence over defaults
 */
export function mergeWithDefaults(
  schema: Setting[],
  userValues: Record<string, unknown> = {}
): Record<string, unknown> {
  const defaults = extractDefaults(schema);
  return { ...defaults, ...userValues };
}

/**
 * Validate that required settings have values
 * Returns list of missing required setting keys
 */
export function validateRequired(
  _schema: Setting[],
  values: Record<string, unknown>,
  requiredKeys: string[]
): string[] {
  const missing: string[] = [];
  for (const key of requiredKeys) {
    if (values[key] === undefined || values[key] === null || values[key] === "") {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * Get all setting keys from a schema (flattened)
 */
export function getAllKeys(settings: Setting[]): string[] {
  const keys: string[] = [];

  function processItems(items: Setting[]) {
    for (const item of items) {
      if ("key" in item && item.key) {
        keys.push(item.key);
      }
      if ("items" in item && item.items) {
        processItems(item.items);
      }
    }
  }

  processItems(settings);
  return keys;
}

