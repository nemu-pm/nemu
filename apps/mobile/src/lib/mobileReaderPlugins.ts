import type {
  ReaderPluginSettings,
  SourcePackageSetting,
  UserSettings,
} from "@/data/schema";
import { getMobileStrings, type MobileStrings } from "./mobileI18n";
import {
  countRenderableSourceSettings,
  mergeSourceSettingValues,
} from "./mobileSourceSettings";

export type MobileReaderPluginId = "japanese-learning" | "dual-reader";

export type MobileReaderPlugin = {
  id: MobileReaderPluginId;
  name: string;
  description: string;
  icon: "language-outline" | "copy-outline";
  defaultEnabled: boolean;
  builtin: boolean;
  settings: SourcePackageSetting[];
};

export type MobileReaderPluginState = MobileReaderPlugin & {
  enabled: boolean;
  values: Record<string, unknown>;
};

export type MobileReaderPluginVisibilityContext = {
  linkedSourceCount: number;
  sourceLanguages?: string[] | null;
  chapterLanguage?: string | null;
};

function makeMobileReaderPlugins(strings: MobileStrings): MobileReaderPlugin[] {
  return [
    {
      id: "japanese-learning",
      name: strings.reader.pluginJapaneseLearningName,
      description: strings.reader.pluginJapaneseLearningDescription,
      icon: "language-outline",
      defaultEnabled: true,
      builtin: true,
      settings: [
        {
          key: "detection",
          title: strings.reader.pluginJapaneseLearningDetection,
          type: "group",
          items: [
            {
              key: "autoDetect",
              title: strings.reader.pluginJapaneseLearningAutoDetectText,
              subtitle:
                strings.reader.pluginJapaneseLearningAutoDetectTextDescription,
              type: "switch",
              default: false,
            },
            {
              key: "enableForAllLanguages",
              title: strings.reader.pluginJapaneseLearningAllLanguages,
              subtitle:
                strings.reader.pluginJapaneseLearningAllLanguagesDescription,
              type: "switch",
              default: false,
            },
            {
              key: "minConfidence",
              title: strings.reader.pluginJapaneseLearningMinimumConfidence,
              subtitle:
                strings.reader.pluginJapaneseLearningMinimumConfidenceDescription,
              type: "slider",
              min: 10,
              max: 90,
              step: 5,
              default: 25,
              formatValue: (value) => `${value}%`,
            },
          ],
        },
        {
          key: "nemuChat",
          title: strings.reader.pluginJapaneseLearningNemuChat,
          type: "group",
          items: [
            {
              key: "nemuResponseMode",
              title: strings.reader.pluginJapaneseLearningResponseLanguage,
              subtitle:
                strings.reader.pluginJapaneseLearningResponseLanguageDescription,
              type: "select",
              values: ["app", "jlpt"],
              titles: [
                strings.reader.pluginValueAppLanguage,
                strings.reader.pluginValueSimpleJapanese,
              ],
              default: "app",
            },
          ],
        },
      ],
    },
    {
      id: "dual-reader",
      name: strings.reader.pluginDualReadName,
      description: strings.reader.pluginDualReadDescription,
      icon: "copy-outline",
      defaultEnabled: true,
      builtin: true,
      settings: [
        {
          key: "debug",
          title: strings.reader.pluginDualReadDebug,
          type: "group",
          items: [
            {
              key: "debugOverlay",
              title: strings.reader.pluginDualReadDebugOverlay,
              subtitle: strings.reader.pluginDualReadDebugOverlayDescription,
              type: "switch",
              default: false,
            },
          ],
        },
      ],
    },
  ];
}

export const MOBILE_READER_PLUGINS: MobileReaderPlugin[] =
  makeMobileReaderPlugins(getMobileStrings("en"));

export function getLocalizedMobileReaderPlugins(
  strings: MobileStrings
): MobileReaderPlugin[] {
  return makeMobileReaderPlugins(strings);
}

const pluginById = new Map(MOBILE_READER_PLUGINS.map((plugin) => [plugin.id, plugin]));

export function getMobileReaderPlugin(
  pluginId: string
): MobileReaderPlugin | undefined {
  return pluginById.get(pluginId as MobileReaderPluginId);
}

export function isJapaneseMobileLanguage(language: string | null | undefined): boolean {
  if (!language) return false;
  const normalized = language.toLowerCase();
  return normalized === "ja" || normalized.startsWith("ja-");
}

export function isJapaneseOnlyMobileSource(
  sourceLanguages: string[] | null | undefined
): boolean {
  if (!sourceLanguages || sourceLanguages.length !== 1) return false;
  return isJapaneseMobileLanguage(sourceLanguages[0]);
}

export function isMobileReaderPluginVisible(
  plugin: MobileReaderPluginState,
  context: MobileReaderPluginVisibilityContext
): boolean {
  if (!plugin.enabled) return false;
  if (plugin.id === "dual-reader") return context.linkedSourceCount > 1;
  if (plugin.id === "japanese-learning") {
    if (plugin.values.enableForAllLanguages === true) return true;
    return (
      isJapaneseMobileLanguage(context.chapterLanguage) ||
      isJapaneseOnlyMobileSource(context.sourceLanguages)
    );
  }
  return true;
}

export function getMobileReaderPluginEnabled(
  plugin: MobileReaderPlugin,
  state: ReaderPluginSettings | null | undefined
): boolean {
  return state?.enabled ?? plugin.defaultEnabled;
}

export function getMobileReaderPluginValues(
  plugin: MobileReaderPlugin,
  state: ReaderPluginSettings | null | undefined
): Record<string, unknown> {
  return mergeSourceSettingValues(plugin.settings, state?.values);
}

export function getMobileReaderPluginStates(
  settings: UserSettings,
  strings: MobileStrings = getMobileStrings("en")
): MobileReaderPluginState[] {
  const readerPlugins = settings.readerPlugins ?? {};
  return getLocalizedMobileReaderPlugins(strings).map((plugin) => {
    const state = readerPlugins[plugin.id];
    return {
      ...plugin,
      enabled: getMobileReaderPluginEnabled(plugin, state),
      values: getMobileReaderPluginValues(plugin, state),
    };
  });
}

export function getMobileReaderSettingsSelectedPlugin(
  plugins: MobileReaderPluginState[],
  selectedPluginId: string | null | undefined
): MobileReaderPluginState | null {
  if (plugins.length === 0) return null;
  const selected = selectedPluginId
    ? plugins.find((plugin) => plugin.id === selectedPluginId)
    : undefined;
  if (selected) return selected;
  return (
    plugins.find(
      (plugin) => plugin.enabled && countRenderableSourceSettings(plugin.settings) > 0,
    ) ??
    plugins[0]
  );
}

export function canSelectMobileReaderPluginOption({
  selected,
  disabled,
}: {
  selected: boolean;
  disabled: boolean;
}): boolean {
  return !selected && !disabled;
}

export function canOpenMobileReaderPluginSettingsAction({
  settingsOpen,
  activePluginId,
  disabled,
}: {
  settingsOpen: boolean;
  activePluginId: string | null;
  disabled: boolean;
}): boolean {
  return !disabled && (!settingsOpen || activePluginId !== null);
}

export function setMobileReaderPluginEnabled(
  settings: UserSettings,
  pluginId: MobileReaderPluginId,
  enabled: boolean
): UserSettings {
  const plugin = getMobileReaderPlugin(pluginId);
  if (!plugin) return settings;

  const current = settings.readerPlugins?.[pluginId];
  return {
    ...settings,
    readerPlugins: {
      ...(settings.readerPlugins ?? {}),
      [pluginId]: {
        ...current,
        enabled,
        values: getMobileReaderPluginValues(plugin, current),
        updatedAt: Date.now(),
      },
    },
  };
}

export function setMobileReaderPluginValue(
  settings: UserSettings,
  pluginId: MobileReaderPluginId,
  key: string,
  value: unknown
): UserSettings {
  const plugin = getMobileReaderPlugin(pluginId);
  if (!plugin) return settings;

  const current = settings.readerPlugins?.[pluginId];
  return {
    ...settings,
    readerPlugins: {
      ...(settings.readerPlugins ?? {}),
      [pluginId]: {
        ...current,
        enabled: getMobileReaderPluginEnabled(plugin, current),
        values: {
          ...getMobileReaderPluginValues(plugin, current),
          [key]: value,
        },
        updatedAt: Date.now(),
      },
    },
  };
}

export function resetMobileReaderPluginValues(
  settings: UserSettings,
  pluginId: MobileReaderPluginId
): UserSettings {
  const plugin = getMobileReaderPlugin(pluginId);
  if (!plugin) return settings;

  const current = settings.readerPlugins?.[pluginId];
  return {
    ...settings,
    readerPlugins: {
      ...(settings.readerPlugins ?? {}),
      [pluginId]: {
        ...current,
        enabled: getMobileReaderPluginEnabled(plugin, current),
        values: getMobileReaderPluginValues(plugin, null),
        updatedAt: Date.now(),
      },
    },
  };
}
