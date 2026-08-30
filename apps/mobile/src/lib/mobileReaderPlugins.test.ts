import { describe, expect, test } from "bun:test";
import type { UserSettings } from "@/data/schema";
import {
  canOpenMobileReaderPluginSettingsAction,
  canSelectMobileReaderPluginOption,
  getMobileReaderSettingsSelectedPlugin,
  getMobileReaderPluginStates,
  isMobileReaderPluginVisible,
  resetMobileReaderPluginValues,
  setMobileReaderPluginEnabled,
  setMobileReaderPluginValue,
} from "./mobileReaderPlugins";
import { getMobileStrings } from "./mobileI18n";

const emptySettings: UserSettings = {
  installedSources: [],
};

describe("mobile reader plugin helpers", () => {
  test("builds default states for built-in reader plugins", () => {
    const plugins = getMobileReaderPluginStates(emptySettings);

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "japanese-learning",
      "dual-reader",
    ]);
    expect(plugins.every((plugin) => plugin.enabled)).toBe(true);
    expect(plugins[0].values).toMatchObject({
      autoDetect: false,
      enableForAllLanguages: false,
      minConfidence: 25,
      nemuResponseMode: "app",
    });
    expect(plugins[1].values).toMatchObject({
      debugOverlay: false,
    });
  });

  test("formats Japanese Learning confidence as a percentage slider like web", () => {
    const japaneseLearning = getMobileReaderPluginStates(emptySettings)[0];
    const confidenceSetting = japaneseLearning.settings[0].items?.find(
      (setting) => setting.key === "minConfidence",
    );

    expect(confidenceSetting?.type).toBe("slider");
    expect(confidenceSetting?.formatValue?.(25)).toBe("25%");
  });

  test("localizes built-in reader plugin labels and settings", () => {
    const plugins = getMobileReaderPluginStates(
      emptySettings,
      getMobileStrings("zh"),
    );
    const japaneseLearning = plugins[0];
    const dualRead = plugins[1];

    expect(japaneseLearning.name).toBe("日语学习");
    expect(japaneseLearning.settings[0].title).toBe("检测");
    expect(japaneseLearning.settings[0].items?.[0].title).toBe("自动检测文字");
    expect(japaneseLearning.settings[1].items?.[0].titles).toEqual([
      "应用语言",
      "简明日语",
    ]);
    expect(dualRead.name).toBe("双源阅读");
    expect(dualRead.settings[0].items?.[0].title).toBe("调试浮层");
  });

  test("persists enablement without dropping existing values", () => {
    const withValue = setMobileReaderPluginValue(
      emptySettings,
      "japanese-learning",
      "autoDetect",
      true
    );
    const disabled = setMobileReaderPluginEnabled(
      withValue,
      "japanese-learning",
      false
    );

    const japaneseLearning = getMobileReaderPluginStates(disabled)[0];
    expect(japaneseLearning.enabled).toBe(false);
    expect(japaneseLearning.values.autoDetect).toBe(true);
    expect(typeof disabled.readerPlugins?.["japanese-learning"]?.updatedAt).toBe("number");
  });

  test("resets values while preserving plugin enablement", () => {
    const customized = setMobileReaderPluginValue(
      setMobileReaderPluginEnabled(emptySettings, "dual-reader", false),
      "dual-reader",
      "debugOverlay",
      true
    );
    const reset = resetMobileReaderPluginValues(customized, "dual-reader");
    const dualRead = getMobileReaderPluginStates(reset).find(
      (plugin) => plugin.id === "dual-reader"
    );

    expect(dualRead?.enabled).toBe(false);
    expect(dualRead?.values).toEqual({ debugOverlay: false });
  });

  test("matches web reader plugin visibility rules", () => {
    const plugins = getMobileReaderPluginStates(emptySettings);
    const japaneseLearning = plugins.find((plugin) => plugin.id === "japanese-learning");
    const dualReader = plugins.find((plugin) => plugin.id === "dual-reader");

    expect(japaneseLearning).toBeDefined();
    expect(dualReader).toBeDefined();
    expect(
      isMobileReaderPluginVisible(japaneseLearning!, {
        linkedSourceCount: 1,
        sourceLanguages: ["en"],
      })
    ).toBe(false);
    expect(
      isMobileReaderPluginVisible(japaneseLearning!, {
        linkedSourceCount: 1,
        sourceLanguages: ["ja"],
      })
    ).toBe(true);
    expect(
      isMobileReaderPluginVisible(japaneseLearning!, {
        linkedSourceCount: 1,
        sourceLanguages: ["en", "ja"],
      })
    ).toBe(false);
    expect(
      isMobileReaderPluginVisible(japaneseLearning!, {
        linkedSourceCount: 1,
        sourceLanguages: ["en", "ja"],
        chapterLanguage: "ja-JP",
      })
    ).toBe(true);
    expect(
      isMobileReaderPluginVisible(dualReader!, {
        linkedSourceCount: 1,
        sourceLanguages: ["ja"],
      })
    ).toBe(false);
    expect(
      isMobileReaderPluginVisible(dualReader!, {
        linkedSourceCount: 2,
        sourceLanguages: ["ja"],
      })
    ).toBe(true);
  });

  test("allows Japanese Learning on all languages when configured", () => {
    const configured = setMobileReaderPluginValue(
      emptySettings,
      "japanese-learning",
      "enableForAllLanguages",
      true
    );
    const japaneseLearning = getMobileReaderPluginStates(configured).find(
      (plugin) => plugin.id === "japanese-learning"
    );

    expect(
      isMobileReaderPluginVisible(japaneseLearning!, {
        linkedSourceCount: 1,
        sourceLanguages: ["en"],
      })
    ).toBe(true);
  });

  test("selects explicit reader plugin settings target", () => {
    const plugins = getMobileReaderPluginStates(emptySettings);

    expect(
      getMobileReaderSettingsSelectedPlugin(plugins, "dual-reader")?.id,
    ).toBe("dual-reader");
  });

  test("gates selected reader plugin options as no-op selections", () => {
    expect(
      canSelectMobileReaderPluginOption({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileReaderPluginOption({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileReaderPluginOption({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });

  test("gates the open reader plugin settings action as a no-op selection", () => {
    expect(
      canOpenMobileReaderPluginSettingsAction({
        settingsOpen: false,
        activePluginId: null,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canOpenMobileReaderPluginSettingsAction({
        settingsOpen: true,
        activePluginId: "japanese-learning",
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canOpenMobileReaderPluginSettingsAction({
        settingsOpen: true,
        activePluginId: null,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canOpenMobileReaderPluginSettingsAction({
        settingsOpen: false,
        activePluginId: null,
        disabled: true,
      }),
    ).toBe(false);
  });

  test("falls back to enabled configurable reader plugin settings target", () => {
    const disabledJapaneseLearning = setMobileReaderPluginEnabled(
      emptySettings,
      "japanese-learning",
      false,
    );
    const plugins = getMobileReaderPluginStates(disabledJapaneseLearning);

    expect(getMobileReaderSettingsSelectedPlugin(plugins, null)?.id).toBe(
      "dual-reader",
    );
  });

  test("falls back using nested renderable reader plugin settings", () => {
    const plugins = getMobileReaderPluginStates(emptySettings);
    const linkOnlyPlugin = {
      ...plugins[0],
      settings: [
        {
          key: "docs",
          title: "Docs",
          type: "link",
          url: "https://example.com",
        },
      ],
    };
    const nestedSettingsPlugin = {
      ...plugins[1],
      settings: [
        {
          key: "group",
          title: "Group",
          type: "group",
          items: [
            {
              key: "enabled",
              title: "Enabled",
              type: "switch",
              default: true,
            },
          ],
        },
      ],
    };

    expect(
      getMobileReaderSettingsSelectedPlugin(
        [linkOnlyPlugin, nestedSettingsPlugin],
        null,
      )?.id,
    ).toBe("japanese-learning");
  });

  test("keeps disabled explicit reader plugin settings target selectable", () => {
    const disabledJapaneseLearning = setMobileReaderPluginEnabled(
      emptySettings,
      "japanese-learning",
      false,
    );
    const plugins = getMobileReaderPluginStates(disabledJapaneseLearning);

    expect(
      getMobileReaderSettingsSelectedPlugin(plugins, "japanese-learning")?.id,
    ).toBe("japanese-learning");
  });
});
