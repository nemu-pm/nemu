export type CoreSettingNode = {
  key?: string;
  type?: string;
  default?: unknown;
  items?: readonly CoreSettingNode[];
  requires?: string;
  requiresFalse?: string;
  requiresFeature?: string;
};

export type CoreSettingFeatureFlags = Record<string, boolean>;

/** Keep untrusted source schemas bounded for shared helpers and UI callers. */
export const MAX_CORE_SETTING_DEPTH = 32;
export const MAX_CORE_SETTING_NODES = 1_024;
export const MAX_CORE_SETTING_OPTIONS = 256;
export const MAX_CORE_SETTING_LIST_ITEMS = 256;
export const MAX_CORE_SETTING_KEY_LENGTH = 256;
export const MAX_CORE_SETTING_STRING_LENGTH = 4_096;
export const MAX_CORE_SETTING_URL_LENGTH = 8_192;
export const MAX_CORE_SETTING_SCHEMA_STRING_CHARS = 1_048_576;
export const MAX_CORE_SETTING_SLIDER_STEPS = 1_000_000;
export const MAX_ABSOLUTE_CORE_SETTING_NUMBER = 1_000_000_000_000;

function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function asCoreSettingArray(value: unknown): readonly unknown[] | null {
  try {
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function safeArrayLength(value: readonly unknown[]): number {
  const length = ownDataValue(value, "length");
  return Number.isSafeInteger(length) && (length as number) >= 0
    ? (length as number)
    : 0;
}

function safeArrayValue(value: readonly unknown[], index: number): unknown {
  return ownDataValue(value, String(index));
}

function safeRecordValue(value: unknown, key: string): unknown {
  return value && (typeof value === "object" || typeof value === "function")
    ? ownDataValue(value, key)
    : undefined;
}

export function isCoreSettingVisible(
  setting: CoreSettingNode,
  values: Record<string, unknown>,
  features: CoreSettingFeatureFlags = {},
): boolean {
  if (!setting || typeof setting !== "object") return false;
  if (ownDataValue(setting, "type") === "group") return true;
  const requires = ownDataValue(setting, "requires");
  const requiresFalse = ownDataValue(setting, "requiresFalse");
  const requiresFeature = ownDataValue(setting, "requiresFeature");
  if (typeof requires === "string" && !safeRecordValue(values, requires))
    return false;
  if (
    typeof requiresFalse === "string" &&
    safeRecordValue(values, requiresFalse)
  )
    return false;
  if (
    typeof requiresFeature === "string" &&
    !safeRecordValue(features, requiresFeature)
  )
    return false;
  return true;
}

export function flattenCoreSettings<T extends CoreSettingNode>(
  settings: readonly T[],
  includeSetting: (setting: T) => boolean = () => true,
): T[] {
  const root = asCoreSettingArray(settings);
  if (!root) return [];

  const flattened: T[] = [];
  const seen = new WeakSet<object>();
  const stack: Array<{
    items: readonly unknown[];
    length: number;
    index: number;
    depth: number;
  }> = [{ items: root, length: safeArrayLength(root), index: 0, depth: 0 }];
  let visitedEntries = 0;

  // Keep frames instead of eagerly pushing every child. A hostile sparse or
  // million-entry array therefore costs at most MAX_CORE_SETTING_NODES work
  // and O(depth) auxiliary memory.
  while (stack.length > 0 && visitedEntries < MAX_CORE_SETTING_NODES) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.length) {
      stack.pop();
      continue;
    }

    const setting = safeArrayValue(frame.items, frame.index++) as T | undefined;
    visitedEntries += 1;
    if (!setting || typeof setting !== "object" || seen.has(setting)) continue;
    seen.add(setting);
    let included = false;
    try {
      included = includeSetting(setting);
    } catch {
      // Callers commonly inspect `type`. A hostile accessor must not turn a
      // bounded helper into a settings-surface crash.
    }
    if (included) {
      flattened.push(setting);
    }
    const childItems = ownDataValue(setting, "items");
    const children = asCoreSettingArray(childItems);
    if (frame.depth >= MAX_CORE_SETTING_DEPTH || !children) {
      continue;
    }
    stack.push({
      items: children,
      length: safeArrayLength(children),
      index: 0,
      depth: frame.depth + 1,
    });
  }

  return flattened;
}

export function extractCoreSettingDefaults(
  settings: readonly CoreSettingNode[],
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const setting of flattenCoreSettings(settings)) {
    const key = ownDataValue(setting, "key");
    const value = ownDataValue(setting, "default");
    if (typeof key !== "string" || key.length === 0 || value === undefined) {
      continue;
    }
    Object.defineProperty(defaults, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return defaults;
}

export function mergeCoreSettingValues(
  settings: readonly CoreSettingNode[],
  values: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged = extractCoreSettingDefaults(settings);
  if (!values || typeof values !== "object") return merged;
  let keys: string[];
  try {
    keys = Object.getOwnPropertyNames(values);
  } catch {
    return merged;
  }
  for (const key of keys.slice(0, MAX_CORE_SETTING_NODES)) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(values, key);
    } catch {
      continue;
    }
    if (!descriptor?.enumerable || !("value" in descriptor)) continue;
    Object.defineProperty(merged, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return merged;
}

export function getCoreSettingKeys(
  settings: readonly CoreSettingNode[],
): string[] {
  return flattenCoreSettings(settings)
    .map((setting) => {
      const key = ownDataValue(setting, "key");
      return typeof key === "string" ? key.trim() : "";
    })
    .filter(Boolean);
}

export function countCoreSettings<T extends CoreSettingNode>(
  settings: readonly T[],
  predicate: (setting: T) => boolean,
): number {
  let count = 0;
  for (const setting of flattenCoreSettings(settings)) {
    try {
      if (predicate(setting)) count += 1;
    } catch {
      // The schema is untrusted; a predicate reading a hostile accessor should
      // fail closed for that node without aborting the entire traversal.
    }
  }
  return count;
}
