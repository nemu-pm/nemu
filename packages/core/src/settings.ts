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

export function isCoreSettingVisible(
  setting: CoreSettingNode,
  values: Record<string, unknown>,
  features: CoreSettingFeatureFlags = {},
): boolean {
  if (setting.type === "group") return true;
  if (setting.requires && !values[setting.requires]) return false;
  if (setting.requiresFalse && values[setting.requiresFalse]) return false;
  if (setting.requiresFeature && !features[setting.requiresFeature]) return false;
  return true;
}

export function flattenCoreSettings<T extends CoreSettingNode>(
  settings: readonly T[],
  includeSetting: (setting: T) => boolean = () => true,
): T[] {
  const flattened: T[] = [];

  for (const setting of settings) {
    if (includeSetting(setting)) {
      flattened.push(setting);
    }
    if (setting.items?.length) {
      flattened.push(...flattenCoreSettings(setting.items as readonly T[], includeSetting));
    }
  }

  return flattened;
}

export function extractCoreSettingDefaults(
  settings: readonly CoreSettingNode[],
): Record<string, unknown> {
  return Object.fromEntries(
    flattenCoreSettings(settings)
      .filter((setting) => setting.key && setting.default !== undefined)
      .map((setting) => [setting.key as string, setting.default]),
  );
}

export function mergeCoreSettingValues(
  settings: readonly CoreSettingNode[],
  values: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...extractCoreSettingDefaults(settings),
    ...(values ?? {}),
  };
}

export function getCoreSettingKeys(settings: readonly CoreSettingNode[]): string[] {
  return flattenCoreSettings(settings)
    .map((setting) => setting.key?.trim() ?? "")
    .filter(Boolean);
}

export function countCoreSettings<T extends CoreSettingNode>(
  settings: readonly T[],
  predicate: (setting: T) => boolean,
): number {
  return flattenCoreSettings(settings).filter(predicate).length;
}
