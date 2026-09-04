import { describe, expect, test } from "bun:test";
import {
  applyMobileSourceSettingsPatch,
  applyMobileSourceSettingChange,
  canRetryMobileSourceSettingsLoadError,
  canRunMobileSourceTextSettingBlurFeedback,
  canStartMobileSourceSettingsAction,
  countRenderableSourceSettings,
  countVisibleSourceSettings,
  describeSourceSettingValue,
  extractSourceSettingDefaults,
  flattenSourceSettings,
  flattenVisibleEditableSourceSettings,
  formatSourceSettingSliderValue,
  formatSourceSettingAccessibilityLabel,
  getMobileSourceSettingsNavigationResetKey,
  getSourceSegmentOptions,
  getSourceSettingOptions,
  hasVisibleSourceSettingRows,
  isMobileSourceSettingsActionBusy,
  canSelectMobileSourceSettingOption,
  isSourceSettingVisible,
  loadMobileSourceSettingsByKeys,
  makeMobileSourceKey,
  mergeSourceSettingValues,
  normalizeMobileSourceSettingsKeys,
  sourceSettingRequestsDataRefresh,
  sourceSettingsRequestDataRefresh,
} from "./mobileSourceSettings";
import { getMobileStrings } from "./mobileI18n";
import type { SourcePackageSetting } from "@/data/schema";

const strings = getMobileStrings("en");

const settings: SourcePackageSetting[] = [
  {
    key: "group",
    title: "Group",
    type: "group",
    default: "container",
    items: [
      { key: "enabled", title: "Enabled", type: "switch", default: true },
      {
        key: "quality",
        title: "Quality",
        type: "select",
        requires: "enabled",
        values: ["low", "high"],
        titles: ["Low", "High"],
        default: "high",
      },
    ],
    footer: "Group footer",
  },
  {
    key: "blocked",
    title: "Blocked Tags",
    type: "multi-select",
    values: ["horror", "spoiler"],
    titles: ["Horror", "Spoiler"],
    default: ["spoiler"],
  },
  {
    key: "aliases",
    title: "Aliases",
    type: "editable-list",
    default: ["Main Alias"],
  },
  {
    key: "advanced",
    title: "Advanced",
    type: "page",
    subtitle: "Tuning",
    default: "container-page",
    items: [
      {
        key: "layout",
        title: "Layout",
        type: "segment",
        titles: ["Grid", "List"],
        default: 1,
      },
      {
        key: "compact",
        title: "Compact",
        type: "switch",
        requiresFalse: "enabled",
        default: false,
      },
      {
        key: "webgpu",
        title: "WebGPU",
        type: "switch",
        requiresFeature: "webgpu",
        default: true,
      },
    ],
  },
];

describe("mobile source settings helpers", () => {
  test("builds stable source keys", () => {
    expect(makeMobileSourceKey("aidoku-community", "en.example")).toBe(
      "aidoku-community:en.example",
    );
  });

  test("deduplicates source settings keys with the primary key first", () => {
    expect(
      normalizeMobileSourceSettingsKeys(" aidoku-community:manifest.id ", [
        "aidoku-community:registry-id",
        "aidoku-community:manifest.id",
        "",
        undefined,
      ]),
    ).toEqual(["aidoku-community:manifest.id", "aidoku-community:registry-id"]);
  });

  test("keeps encoded source settings aliases alongside decoded keys", () => {
    expect(
      normalizeMobileSourceSettingsKeys(" aidoku-community:manifest.id ", [
        "aidoku-community:registry%3Aid",
        "legacy%3Aid",
      ]),
    ).toEqual([
      "aidoku-community:manifest.id",
      "aidoku-community:registry%3Aid",
      "aidoku-community:registry:id",
      "legacy%3Aid",
      "legacy:id",
    ]);
  });

  test("builds source settings navigation reset keys from source aliases", () => {
    expect(
      getMobileSourceSettingsNavigationResetKey(
        " aidoku-community:manifest.id ",
        ["aidoku-community:registry-id", "aidoku-community:manifest.id", ""],
      ),
    ).toBe("aidoku-community:manifest.id|aidoku-community:registry-id");
    expect(getMobileSourceSettingsNavigationResetKey(null, [])).toBe("");
  });

  test("loads the first saved source settings row across aliases", async () => {
    const observedKeys: string[] = [];
    const reader = {
      async getSourceSettings(sourceKey: string) {
        observedKeys.push(sourceKey);
        if (sourceKey !== "aidoku-community:registry-id") return null;
        return {
          sourceKey,
          values: { quality: "low" },
          updatedAt: 1,
        };
      },
    };

    await expect(
      loadMobileSourceSettingsByKeys(reader, [
        "aidoku-community:manifest.id",
        "aidoku-community:registry-id",
      ]),
    ).resolves.toMatchObject({
      sourceKey: "aidoku-community:registry-id",
      values: { quality: "low" },
    });
    expect(observedKeys).toEqual([
      "aidoku-community:manifest.id",
      "aidoku-community:registry-id",
    ]);
  });

  test("loads source settings saved under a decoded alias", async () => {
    const observedKeys: string[] = [];
    const reader = {
      async getSourceSettings(sourceKey: string) {
        observedKeys.push(sourceKey);
        if (sourceKey !== "aidoku-community:registry:id") return null;
        return {
          sourceKey,
          values: { quality: "low" },
          updatedAt: 1,
        };
      },
    };

    await expect(
      loadMobileSourceSettingsByKeys(reader, [
        "aidoku-community:registry%3Aid",
      ]),
    ).resolves.toMatchObject({
      sourceKey: "aidoku-community:registry:id",
      values: { quality: "low" },
    });
    expect(observedKeys).toEqual([
      "aidoku-community:registry%3Aid",
      "aidoku-community:registry:id",
    ]);
  });

  test("gates source setting writes while values load or mutate", () => {
    const idle = { loading: false, mutating: false };

    expect(isMobileSourceSettingsActionBusy(idle)).toBe(false);
    expect(canStartMobileSourceSettingsAction(idle)).toBe(true);
    expect(canStartMobileSourceSettingsAction({ ...idle, loading: true })).toBe(
      false,
    );
    expect(
      canStartMobileSourceSettingsAction({ ...idle, mutating: true }),
    ).toBe(false);
  });

  test("gates source settings load-error retries while values load or mutate", () => {
    const idle = { loading: false, mutating: false };

    expect(
      canRetryMobileSourceSettingsLoadError({
        hasError: true,
        state: idle,
      }),
    ).toBe(true);
    expect(
      canRetryMobileSourceSettingsLoadError({
        hasError: false,
        state: idle,
      }),
    ).toBe(false);
    expect(
      canRetryMobileSourceSettingsLoadError({
        hasError: true,
        state: { ...idle, loading: true },
      }),
    ).toBe(false);
    expect(
      canRetryMobileSourceSettingsLoadError({
        hasError: true,
        state: { ...idle, mutating: true },
      }),
    ).toBe(false);
  });

  test("gates selected source setting options as no-op selections", () => {
    expect(
      canSelectMobileSourceSettingOption({ selected: false, disabled: false }),
    ).toBe(true);
    expect(
      canSelectMobileSourceSettingOption({ selected: true, disabled: false }),
    ).toBe(false);
    expect(
      canSelectMobileSourceSettingOption({ selected: false, disabled: true }),
    ).toBe(false);
  });

  test("gates text setting blur feedback to real edits", () => {
    expect(
      canRunMobileSourceTextSettingBlurFeedback({
        initialValue: "old",
        currentValue: "new",
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canRunMobileSourceTextSettingBlurFeedback({
        initialValue: "old",
        currentValue: "old",
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileSourceTextSettingBlurFeedback({
        initialValue: null,
        currentValue: "new",
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileSourceTextSettingBlurFeedback({
        initialValue: "old",
        currentValue: "new",
        disabled: true,
      }),
    ).toBe(false);
  });

  test("flattens nested source settings without group rows", () => {
    expect(
      flattenSourceSettings(settings).map((setting) => setting.key),
    ).toEqual([
      "enabled",
      "quality",
      "blocked",
      "aliases",
      "layout",
      "compact",
      "webgpu",
    ]);
  });

  test("counts nested renderable settings for source and plugin rows", () => {
    expect(countRenderableSourceSettings(settings)).toBe(7);
    expect(
      countRenderableSourceSettings([
        {
          key: "group",
          title: "Group",
          type: "group",
          items: [
            {
              key: "site",
              title: "Website",
              type: "link",
              url: "https://example.com",
            },
            {
              key: "refresh",
              title: "Refresh",
              type: "button",
              action: "refresh",
            },
            { key: "token", title: "Token", type: "text" },
          ],
        },
      ]),
    ).toBe(3);
  });

  test("counts visible rows for the real MANGA Plus settings shape", () => {
    // The actual multi.mangaplus res/settings.json: 2 rows in a SETTINGS
    // group plus a Mobile API group whose 4 text rows are gated behind the
    // "mobile" switch, so the declared and rendered counts diverge.
    const mangaPlusSettings: SourcePackageSetting[] = [
      {
        type: "group",
        key: "settings",
        title: "SETTINGS",
        items: [
          {
            type: "select",
            key: "imgQuality",
            title: "Image Quality",
            values: ["low", "high", "super_high"],
            titles: ["Low", "Medium", "High"],
            default: "super_high",
          },
          {
            type: "switch",
            key: "split",
            title: "Split Double Pages",
            default: false,
          },
        ],
      },
      {
        type: "group",
        key: "mobileApi",
        title: "Mobile API",
        items: [
          {
            type: "switch",
            key: "mobile",
            title: "Use Mobile API",
            default: false,
            refreshes: ["listings", "content"],
          },
          {
            type: "text",
            key: "os",
            title: "os",
            placeholder: "os (e.g., android)",
            requires: "mobile",
          },
          {
            type: "text",
            key: "osVer",
            title: "os_ver",
            placeholder: "os_ver (e.g., 32)",
            requires: "mobile",
          },
          {
            type: "text",
            key: "appVer",
            title: "app_ver",
            placeholder: "app_ver (e.g., 235)",
            requires: "mobile",
          },
          {
            type: "text",
            key: "secret",
            title: "secret",
            placeholder: "secret (hash value)",
            requires: "mobile",
          },
        ],
        footer:
          "These values can be obtained from the MANGA Plus mobile app, for example, by using a network sniffer.",
      },
    ];

    // Both counters agree on the declared count…
    expect(countRenderableSourceSettings(mangaPlusSettings)).toBe(7);
    // …but only 3 rows render with the switch off, and 7 render with it on.
    expect(countVisibleSourceSettings(mangaPlusSettings, {})).toBe(3);
    expect(countVisibleSourceSettings(mangaPlusSettings, { mobile: true })).toBe(
      7,
    );
  });

  test("extracts and merges defaults with user values", () => {
    expect(extractSourceSettingDefaults(settings)).toEqual({
      enabled: true,
      quality: "high",
      blocked: ["spoiler"],
      aliases: ["Main Alias"],
      layout: 1,
      compact: false,
      webgpu: true,
    });

    expect(mergeSourceSettingValues(settings, { quality: "low" })).toEqual({
      enabled: true,
      quality: "low",
      blocked: ["spoiler"],
      aliases: ["Main Alias"],
      layout: 1,
      compact: false,
      webgpu: true,
    });
  });

  test("persists only user values while displaying schema defaults", () => {
    const result = applyMobileSourceSettingChange(
      settings,
      { legacy: "kept" },
      "quality",
      "low",
    );

    expect(result.userValues).toEqual({
      legacy: "kept",
      quality: "low",
    });
    expect(result.values).toEqual({
      enabled: true,
      quality: "low",
      blocked: ["spoiler"],
      aliases: ["Main Alias"],
      layout: 1,
      compact: false,
      webgpu: true,
      legacy: "kept",
    });
  });

  test("applies multi-key patches and deletions as one value transition", () => {
    expect(
      applyMobileSourceSettingsPatch(
        settings,
        { quality: "low", legacy: "remove", untouched: 1 },
        { enabled: false, quality: "high" },
        ["legacy"],
      ),
    ).toEqual({
      userValues: { quality: "high", untouched: 1, enabled: false },
      values: {
        enabled: false,
        quality: "high",
        blocked: ["spoiler"],
        aliases: ["Main Alias"],
        layout: 1,
        compact: false,
        webgpu: true,
        untouched: 1,
      },
    });
  });

  test("describes selected values with display titles", () => {
    expect(
      getSourceSettingOptions(settings[0].items?.[1] as SourcePackageSetting),
    ).toEqual([
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ]);

    expect(
      describeSourceSettingValue(
        settings[0].items?.[1] as SourcePackageSetting,
        {},
        strings,
      ),
    ).toBe("High");
    expect(
      describeSourceSettingValue(settings[1], { blocked: ["horror"] }, strings),
    ).toBe("Horror");
    expect(
      describeSourceSettingValue(
        settings[2],
        { aliases: ["Alias A", "Alias B"] },
        strings,
      ),
    ).toBe("Alias A, Alias B");

    const segmentSetting = settings[3].items?.[0] as SourcePackageSetting;
    expect(getSourceSegmentOptions(segmentSetting)).toEqual([
      { label: "Grid", value: 0 },
      { label: "List", value: 1 },
    ]);
    expect(describeSourceSettingValue(segmentSetting, {}, strings)).toBe(
      "List",
    );
    expect(
      describeSourceSettingValue(segmentSetting, { layout: 0 }, strings),
    ).toBe("Grid");
  });

  test("applies web-compatible visibility rules", () => {
    const qualitySetting = settings[0].items?.[1] as SourcePackageSetting;
    const compactSetting = settings[3].items?.[1] as SourcePackageSetting;
    const featureSetting = settings[3].items?.[2] as SourcePackageSetting;

    expect(isSourceSettingVisible(qualitySetting, { enabled: true })).toBe(
      true,
    );
    expect(isSourceSettingVisible(qualitySetting, { enabled: false })).toBe(
      false,
    );
    expect(isSourceSettingVisible(compactSetting, { enabled: true })).toBe(
      false,
    );
    expect(isSourceSettingVisible(compactSetting, { enabled: false })).toBe(
      true,
    );
    expect(isSourceSettingVisible(featureSetting, {}, {})).toBe(false);
    expect(isSourceSettingVisible(featureSetting, {}, { webgpu: true })).toBe(
      true,
    );
  });

  test("finds visible editable rows without flattening page links in the UI", () => {
    expect(
      flattenVisibleEditableSourceSettings(settings, {
        enabled: true,
        layout: 1,
      }).map((setting) => setting.key),
    ).toEqual(["enabled", "quality", "blocked", "aliases", "layout"]);

    expect(
      flattenVisibleEditableSourceSettings(settings, {
        enabled: false,
        layout: 1,
      }).map((setting) => setting.key),
    ).toEqual(["enabled", "blocked", "aliases", "layout", "compact"]);

    expect(hasVisibleSourceSettingRows(settings, {}, {})).toBe(true);
    expect(
      hasVisibleSourceSettingRows(
        [{ key: "link", title: "Link", type: "link" }],
        {},
      ),
    ).toBe(true);
  });

  test("bounds visible traversal and never invokes hostile schema accessors", () => {
    let getterCalls = 0;
    const accessor = { key: "accessor", title: "Accessor" };
    Object.defineProperty(accessor, "type", {
      get() {
        getterCalls += 1;
        return "text";
      },
    });
    const cyclic: SourcePackageSetting[] = [];
    cyclic.push({
      key: "group",
      title: "Group",
      type: "group",
      items: cyclic,
    });
    const revoked = Proxy.revocable(
      { key: "revoked", title: "Revoked", type: "text" },
      {},
    );
    revoked.revoke();

    expect(() =>
      flattenVisibleEditableSourceSettings(
        [accessor as SourcePackageSetting, revoked.proxy, ...cyclic],
        {},
      ),
    ).not.toThrow();
    expect(
      flattenVisibleEditableSourceSettings(
        [accessor as SourcePackageSetting, revoked.proxy, ...cyclic],
        {},
      ),
    ).toEqual([]);
    expect(() =>
      formatSourceSettingAccessibilityLabel(
        accessor as SourcePackageSetting,
        {},
        strings,
      ),
    ).not.toThrow();
    expect(getterCalls).toBe(0);
  });

  test("describes empty and default values with localized labels", () => {
    const zh = getMobileStrings("zh");
    const switchSetting = settings[0].items?.[0] as SourcePackageSetting;
    const textSetting: SourcePackageSetting = {
      key: "empty",
      title: "Empty",
      type: "text",
    };

    expect(
      describeSourceSettingValue(switchSetting, { enabled: false }, zh),
    ).toBe("关闭");
    expect(describeSourceSettingValue(settings[1], { blocked: [] }, zh)).toBe(
      "无",
    );
    expect(describeSourceSettingValue(textSetting, {}, zh)).toBe("默认");
  });

  test("formats accessibility labels with subtitle and current value", () => {
    const qualitySetting = settings[0].items?.[1] as SourcePackageSetting;
    const compactSetting: SourcePackageSetting = {
      key: "compact",
      title: "Compact layout",
      type: "switch",
      subtitle: "Uses dense rows",
      default: false,
    };

    expect(
      formatSourceSettingAccessibilityLabel(
        qualitySetting,
        { quality: "low" },
        strings,
      ),
    ).toBe("Quality, Low");
    expect(
      formatSourceSettingAccessibilityLabel(
        compactSetting,
        { compact: true },
        strings,
      ),
    ).toBe("Compact layout, Uses dense rows, On");
    expect(
      formatSourceSettingAccessibilityLabel(
        qualitySetting,
        { quality: "high" },
        strings,
        "Decrease Quality",
      ),
    ).toBe("Decrease Quality, High");
  });

  test("fails closed when source slider formatters throw or return unsafe output", () => {
    const slider: SourcePackageSetting = {
      key: "limit",
      title: "Limit",
      type: "slider",
      formatValue() {
        throw new Error("source formatter failed");
      },
    };
    expect(formatSourceSettingSliderValue(slider, 25)).toBe("25");

    slider.formatValue = (() => 10_000) as never;
    expect(formatSourceSettingSliderValue(slider, 25)).toBe("25");
    slider.formatValue = () => `\u202e\u0000${"x".repeat(2_000)}`;
    expect(formatSourceSettingSliderValue(slider, 25)).toBe("x".repeat(256));
  });

  test("drops unsafe persisted values at the mobile merge boundary", () => {
    let getterCalls = 0;
    const userValues: Record<string, unknown> = {
      quality: "low",
      nested: { secret: "unsafe" },
      list: ["safe", 1],
      timestamp: 9_999_999_999_999,
    };
    Object.defineProperty(userValues, "accessor", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "unsafe";
      },
    });

    expect(mergeSourceSettingValues(settings, userValues)).toEqual({
      enabled: true,
      quality: "low",
      blocked: ["spoiler"],
      aliases: ["Main Alias"],
      layout: 1,
      compact: false,
      webgpu: true,
      timestamp: 9_999_999_999_999,
    });
    expect(getterCalls).toBe(0);

    expect(
      mergeSourceSettingValues(
        [
          {
            key: "unsafe-default",
            title: "Unsafe",
            type: "text",
            default: { nested: true } as never,
          },
        ],
        null,
      ),
    ).toEqual({});
  });

  test("detects settings that request source data refresh", () => {
    expect(sourceSettingRequestsDataRefresh(settings[0].items?.[0])).toBe(
      false,
    );
    const refreshSetting: SourcePackageSetting = {
      key: "__selected_source_id__",
      title: "Source",
      type: "select",
      values: ["a", "b"],
      refreshes: ["content", "listings", "filters"],
    };

    expect(sourceSettingRequestsDataRefresh(refreshSetting)).toBe(true);
    expect(sourceSettingsRequestDataRefresh(settings)).toBe(false);
    expect(
      sourceSettingsRequestDataRefresh([
        {
          key: "advanced-refresh",
          title: "Advanced",
          type: "page",
          items: [refreshSetting],
        },
      ]),
    ).toBe(true);
    expect(
      sourceSettingsRequestDataRefresh([
        {
          key: "__selected_source_id__",
          title: "Source",
          type: "link",
          url: "https://example.com",
          refreshes: ["content"],
        },
      ]),
    ).toBe(false);
  });
});
