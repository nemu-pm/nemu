/**
 * Settings schema utilities
 * Shared logic for extracting defaults and checking visibility
 */

import type { Setting, FeatureFlags } from "./types";
import {
  extractCoreSettingDefaults,
  getCoreSettingKeys,
  isCoreSettingVisible,
  mergeCoreSettingValues,
} from "@nemu/core";
import { sanitizeSettingsSchema } from "./sanitize";
import { sanitizeSourceSettingValues } from "./values";

/**
 * Extract default values from a settings schema
 * Recursively processes groups and pages
 */
export function extractDefaults(settings: Setting[]): Record<string, unknown> {
  return extractCoreSettingDefaults(sanitizeSettingsSchema(settings));
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
  features: FeatureFlags = {},
): boolean {
  return isCoreSettingVisible(setting, values, features);
}

/**
 * Merge schema defaults with user values
 * User values take precedence over defaults
 */
export function mergeWithDefaults(
  schema: Setting[],
  userValues: Record<string, unknown> = {},
): Record<string, unknown> {
  return mergeCoreSettingValues(
    sanitizeSettingsSchema(schema),
    sanitizeSourceSettingValues(userValues),
  );
}

/**
 * Validate that required settings have values
 * Returns list of missing required setting keys
 */
export function validateRequired(
  _schema: Setting[],
  values: Record<string, unknown>,
  requiredKeys: string[],
): string[] {
  const missing: string[] = [];
  for (const key of requiredKeys) {
    if (
      values[key] === undefined ||
      values[key] === null ||
      values[key] === ""
    ) {
      missing.push(key);
    }
  }
  return missing;
}

/**
 * Get all setting keys from a schema (flattened)
 */
export function getAllKeys(settings: Setting[]): string[] {
  return getCoreSettingKeys(sanitizeSettingsSchema(settings));
}
