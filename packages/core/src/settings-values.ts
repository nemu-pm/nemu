import { isUnsafeSettingTextCodePoint } from "./settings-display";

export const MAX_SOURCE_SETTING_KEYS = 1_024;
export const MAX_SOURCE_SETTING_VALUE_KEY_LENGTH = 512;
export const MAX_SOURCE_SETTING_VALUE_STRING_LENGTH = 256 * 1_024;
export const MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS = 256;
export const MAX_SOURCE_SETTING_VALUES_STRING_CHARS = 4 * 1_024 * 1_024;

export type SanitizedSourceSettingValue = string | number | boolean | string[];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  try {
    if (Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function isSafeSourceSettingValueKey(key: string): boolean {
  if (
    key.length === 0 ||
    key.length > MAX_SOURCE_SETTING_VALUE_KEY_LENGTH ||
    key.trim().length === 0
  ) {
    return false;
  }
  for (const character of key) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      isUnsafeSettingTextCodePoint(codePoint)
    ) {
      return false;
    }
  }
  return true;
}

function sanitizeValue(
  value: unknown,
  remainingStringChars: number,
): { value: SanitizedSourceSettingValue; stringChars: number } | null {
  if (typeof value === "boolean") return { value, stringChars: 0 };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, stringChars: 0 };
  }
  if (typeof value === "string") {
    if (
      value.length > MAX_SOURCE_SETTING_VALUE_STRING_LENGTH ||
      value.length > remainingStringChars
    ) {
      return null;
    }
    return { value, stringChars: value.length };
  }

  let isArray = false;
  try {
    isArray = Array.isArray(value);
  } catch {
    return null;
  }
  if (!isArray) return null;

  const input = value as unknown[];
  let lengthDescriptor: PropertyDescriptor | undefined;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(input, "length");
  } catch {
    return null;
  }
  const length =
    lengthDescriptor && "value" in lengthDescriptor
      ? lengthDescriptor.value
      : undefined;
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_SOURCE_SETTING_VALUE_ARRAY_ITEMS
  ) {
    return null;
  }

  const result: string[] = [];
  let stringChars = 0;
  for (let index = 0; index < length; index += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    } catch {
      return null;
    }
    if (!descriptor || !("value" in descriptor)) return null;
    const item = descriptor.value;
    if (
      typeof item !== "string" ||
      item.length > MAX_SOURCE_SETTING_VALUE_STRING_LENGTH ||
      stringChars + item.length > remainingStringChars
    ) {
      // Reject the whole array so parallel cookie key/value arrays cannot
      // silently shift indexes after one corrupt element is removed.
      return null;
    }
    result.push(item);
    stringChars += item.length;
  }
  return { value: result, stringChars };
}

/** Keep persisted source preferences to the scalar/string-array shapes used by
 * Aidoku, Tachiyomi, login credentials, cookies, and OAuth state. */
export function sanitizeSourceSettingValues(
  input: unknown,
): Record<string, unknown> {
  if (!isPlainRecord(input)) return {};

  let keys: string[];
  try {
    keys = Object.getOwnPropertyNames(input);
  } catch {
    return {};
  }

  const output: Record<string, unknown> = {};
  let remainingStringChars = MAX_SOURCE_SETTING_VALUES_STRING_CHARS;
  const keyCount = Math.min(keys.length, MAX_SOURCE_SETTING_KEYS);
  for (let index = 0; index < keyCount; index += 1) {
    const key = keys[index]!;
    if (
      !isSafeSourceSettingValueKey(key) ||
      key.length > remainingStringChars
    ) {
      continue;
    }
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, key);
    } catch {
      continue;
    }
    if (!descriptor || !("value" in descriptor)) continue;
    const sanitized = sanitizeValue(
      descriptor.value,
      remainingStringChars - key.length,
    );
    if (!sanitized) continue;
    Object.defineProperty(output, key, {
      value: sanitized.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    remainingStringChars -= key.length + sanitized.stringChars;
    if (remainingStringChars <= 0) break;
  }
  return output;
}
