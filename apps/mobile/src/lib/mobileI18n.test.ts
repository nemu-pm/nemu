import { describe, expect, test } from "bun:test";
import {
  formatMobileSettingsCount,
  formatMobileString,
  getMobileStrings,
  getMobileStringsForAudit,
} from "./mobileI18n";

const INTENTIONAL_EMPTY_MOBILE_STRINGS = new Set([
  "en:settings.aboutNemuAfterBrand",
  "zh:settings.aboutNemuAfterBrand",
  "ja:settings.aboutNemuBeforeBrand",
]);

function flattenStringLeaves(
  value: unknown,
  prefix = "",
): Map<string, string> {
  const output = new Map<string, string>();
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      output.set(path, child);
    } else if (child && typeof child === "object") {
      for (const [childPath, leaf] of flattenStringLeaves(child, path)) {
        output.set(childPath, leaf);
      }
    }
  }
  return output;
}

function interpolationKeys(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)]
    .map((match) => match[1]!)
    .sort();
}

describe("mobile i18n helpers", () => {
  test("keeps every locale structurally and parametrically identical", () => {
    const catalogs = getMobileStringsForAudit();
    const english = flattenStringLeaves(catalogs.en);
    const englishPaths = [...english.keys()].sort();

    for (const language of ["zh", "ja"] as const) {
      const localized = flattenStringLeaves(catalogs[language]);
      expect([...localized.keys()].sort()).toEqual(englishPaths);
      for (const [path, englishValue] of english) {
        expect(interpolationKeys(localized.get(path)!)).toEqual(
          interpolationKeys(englishValue),
        );
      }
    }
  });

  test("rejects empty translations unless their paths are explicitly intentional", () => {
    const catalogs = getMobileStringsForAudit();
    for (const [language, catalog] of Object.entries(catalogs)) {
      for (const [path, value] of flattenStringLeaves(catalog)) {
        if (INTENTIONAL_EMPTY_MOBILE_STRINGS.has(`${language}:${path}`)) continue;
        expect(`${language}:${path}:${value.trim()}`).not.toBe(`${language}:${path}:`);
      }
    }
    for (const entry of INTENTIONAL_EMPTY_MOBILE_STRINGS) {
      const separator = entry.indexOf(":");
      const language = entry.slice(0, separator) as keyof typeof catalogs;
      const path = entry.slice(separator + 1);
      expect(flattenStringLeaves(catalogs[language]).get(path)).toBe("");
    }
  });

  test("uses Simplified Chinese product terminology", () => {
    const strings = getMobileStrings("zh");
    expect(strings.nav.library).toBe("书架");
    expect(strings.nav.settings).toBe("设置");
    expect(strings.browse.searchRegistries).toBe("搜索源仓库");
  });

  test("localizes every stable source OAuth failure code", () => {
    const settings = getMobileStrings("en").settings as unknown as {
      sourceOAuthErrors?: Record<string, string>;
    };
    expect(settings.sourceOAuthErrors).toEqual({
      "missing-login-url": "This source does not provide a login URL.",
      "invalid-login-url": "This source provided an unsafe login URL.",
      "browser-open-failed": "The login page could not be opened.",
      "unsupported-platform": "Source login is unavailable on this platform.",
      cancelled: "Login was cancelled.",
      "oversized-callback": "The source returned too much login data.",
      "state-mismatch": "The login response did not match this attempt.",
      "invalid-callback": "The login response did not contain a valid token or code.",
      "missing-token-endpoint": "This source does not provide a token endpoint.",
      "token-request-failed": "The token request could not be completed.",
      "token-exchange-failed": "The source rejected the token exchange.",
      "oversized-token": "The source returned too much token data.",
    });
  });

  test("localizes the drag-handle accessibility label", () => {
    expect(
      (getMobileStrings("en").common as { dragHandle?: string }).dragHandle,
    ).toBe("Drag handle");
    expect(
      (getMobileStrings("zh").common as { dragHandle?: string }).dragHandle,
    ).toBe("拖动手柄");
    expect(
      (getMobileStrings("ja").common as { dragHandle?: string }).dragHandle,
    ).toBe("ドラッグハンドル");
  });

  test("falls back to English for unsupported app languages", () => {
    expect(getMobileStrings("fr").nav.settings).toBe("Settings");
  });

  test("keeps mobile welcome copy aligned with web without web-based wording", () => {
    expect(getMobileStrings("en").welcome.intro).toBe(
      "A cross-platform manga reader that lets you discover and read manga from various Internet sources.\nLet's get you set up!",
    );
    expect(getMobileStrings("en").welcome.intro).not.toContain("web-based");
    expect(getMobileStrings("zh").welcome.intro).toBe(
      "跨平台漫画阅读器，让你可以发现和阅读互联网上各种来源的漫画。\n让我们来完成初始设置吧！",
    );
    expect(getMobileStrings("zh").welcome.intro).not.toContain("基于 Web");
    expect(getMobileStrings("ja").welcome.intro).toBe(
      "様々なインターネットソースから漫画を発見して読むことができるクロスプラットフォーム漫画リーダーです。\nセットアップを始めましょう！",
    );
    expect(getMobileStrings("ja").welcome.intro).not.toContain("ウェブベース");
    expect(getMobileStrings("ja").welcome.doneDescription).toBe(
      "インストールしたソースから漫画を探索しましょう。",
    );
  });

  test("returns localized nav and settings labels", () => {
    expect(getMobileStrings("zh").nav.library).toBe("书架");
    expect(getMobileStrings("zh").browse.searchRegistries).toBe("搜索源仓库");
    expect(getMobileStrings("zh").about.sourceCode).toBe("源代码");
    expect(getMobileStrings("zh").common.sourceCloudflareBlocked).toBe(
      "检测到 Cloudflare 保护",
    );
    expect(getMobileStrings("zh").settings.cloudSync).toBe("云同步");
    expect(getMobileStrings("ja").settings.sourceSettingsResetLabel).toBe(
      "設定をリセット",
    );
    expect(getMobileStrings("ja").settings.sourceSettingsDefaultValue).toBe(
      "デフォルト",
    );
    expect(getMobileStrings("ja").settings.metadataLanguageAuto).toBe("自動");
    expect(getMobileStrings("en").settings.clearCloudData).toBe(
      "Also delete cloud data",
    );
    expect(getMobileStrings("en").settings.agent).toBe("Nemu Agent");
    expect(getMobileStrings("en").settings.agentBuiltInEnabled).toBe(
      "Built-in Nemu Agent Enabled",
    );
    expect(getMobileStrings("en").settings.agentReady).toBe(
      "Native networking is ready for protected sources",
    );
    expect(getMobileStrings("zh").settings.clearCloudData).toBe("同时删除云端数据");
    expect(getMobileStrings("zh").settings.agent).toBe("Nemu Agent");
    expect(getMobileStrings("zh").settings.agentReady).toBe(
      "原生网络已可用于受保护的源",
    );
    expect(getMobileStrings("ja").settings.agent).toBe("Nemu Agent");
    expect(getMobileStrings("en").browse.installingSource).toBe(
      "Installing Source",
    );
    expect(getMobileStrings("en").browse.warningCloudflare).toContain(
      "built-in native networking",
    );
    expect(getMobileStrings("zh").browse.installingSourceDescription).toBe(
      "正在安装 {{name}}...",
    );
    expect(getMobileStrings("zh").browse.warningCloudflare).toContain(
      "内置原生网络",
    );
    expect(getMobileStrings("ja").browse.warningCloudflare).toContain(
      "内蔵ネイティブ通信",
    );
    expect(getMobileStrings("ja").welcome.startReading).toBe("読み始める");
    expect(getMobileStrings("en").sourceBrowse.resetFilters).toBe("Reset");
    expect(getMobileStrings("zh").sourceBrowse.applyFilters).toBe("应用");
    expect(getMobileStrings("ja").sourceBrowse.applyFilters).toBe("適用");
    expect(getMobileStrings("en").sourceBrowse.selectFeaturedManga).toBe(
      "Show featured manga {{title}}",
    );
    expect(getMobileStrings("en").sourceBrowse.sourceFilterExcludeHint).toBe(
      "Long press to exclude this option.",
    );
    expect(getMobileStrings("en").sourceBrowse.sourceFilterCycleHint).toBe(
      "Press to cycle between include, exclude, and any.",
    );
    expect(getMobileStrings("zh").sourceBrowse.sourceFilterExcludeHint).toBe(
      "长按以排除此选项。",
    );
    expect(getMobileStrings("zh").sourceBrowse.sourceFilterCycleHint).toBe(
      "按下可在包含、排除和任意之间切换。",
    );
    expect(getMobileStrings("ja").sourceBrowse.sourceFilterExcludeHint).toBe(
      "長押しするとこの項目を除外します。",
    );
    expect(getMobileStrings("ja").sourceBrowse.sourceFilterCycleHint).toBe(
      "押すと、含める、除外、任意の順に切り替わります。",
    );
    expect(getMobileStrings("ja").common.sourceNetworkError).toBe(
      "ネットワークエラー",
    );
  });

  test("describes double press and long press source selection", () => {
    expect(getMobileStrings("en").search.sourceSelectionHint).toContain(
      "Double press or long press",
    );
    expect(getMobileStrings("zh").search.sourceSelectionHint).toContain(
      "双击或长按",
    );
    expect(getMobileStrings("ja").search.sourceSelectionHint).toContain(
      "ダブルタップまたは長押し",
    );
  });

  test("formats template values without dropping unknown placeholders", () => {
    expect(
      formatMobileString("Remove {{name}} {{missing}}", { name: "Source" }),
    ).toBe("Remove Source {{missing}}");
    expect(
      formatMobileString(getMobileStrings("ja").search.noSavedMatchesForQuery, {
        query: "Blue Lock",
      }),
    ).toBe("「Blue Lock」に一致する保存済み漫画はありません。");
    expect(
      formatMobileString(getMobileStrings("zh").sourceManager.position, {
        position: 2,
        total: 5,
      }),
    ).toBe("第 2 个，共 5 个");
    expect(
      formatMobileString(
        getMobileStrings("ja").collectionMembership.subtitleForTitle,
        {
          title: "Blue Lock",
        },
      ),
    ).toBe("Blue Lock の棚を選択");
    expect(
      formatMobileString(
        getMobileStrings("zh").collectionMembership.saveWithCount,
        {
          count: 3,
        },
      ),
    ).toBe("保存 3 项");
    expect(
      formatMobileString(getMobileStrings("en").sourceManager.selectSource, {
        name: "MangaDex",
        positionLabel: "Position 2 of 5",
      }),
    ).toBe("Select MangaDex, Position 2 of 5");
    expect(
      formatMobileString(getMobileStrings("en").browse.installSourceNamed, {
        name: "MangaDex",
      }),
    ).toBe("Install MangaDex");
    expect(
      formatMobileString(getMobileStrings("en").library.collectionChipAccessibility, {
        name: "Favorites",
        countLabel: "3 books",
      }),
    ).toBe("Favorites, 3 books");
    expect(
      formatMobileString(getMobileStrings("zh").library.collectionMangaAccessibility, {
        title: "Blue Lock",
        sourceCountLabel: "2 个源",
      }),
    ).toBe("Blue Lock，2 个源");
    expect(getMobileStrings("en").search.noSourcesSelectedDescription).toBe(
      "Select at least one source to search.",
    );
    expect(
      formatMobileString(getMobileStrings("en").sourceManga.removeDescription, {
        name: "Blue Lock",
      }),
    ).toBe('Are you sure you want to remove "Blue Lock" from your library?');
    expect(
      formatMobileString(getMobileStrings("ja").library.removeCollectionNamed, {
        name: "Favorites",
      }),
    ).toBe("Favorites を削除");
    expect(
      formatMobileString(getMobileStrings("zh").browse.removeSourceNamed, {
        name: "MangaDex",
      }),
    ).toBe("移除 MangaDex");
    expect(
      formatMobileString(getMobileStrings("en").settings.selectSettingOption, {
        title: "Theme",
        option: "Dark",
      }),
    ).toBe("Theme: Dark");
    expect(
      formatMobileString(getMobileStrings("zh").settings.readerPluginSwitch, {
        name: "Dual Reader",
      }),
    ).toBe("启用 Dual Reader");
    expect(getMobileStrings("zh").reader.pluginDualReadName).toBe("双语阅读");
    expect(
      formatMobileString(getMobileStrings("en").settings.sourceSettingsSelectOption, {
        name: "Image quality",
        option: "High",
      }),
    ).toBe("Set Image quality to High");
    expect(
      formatMobileString(getMobileStrings("zh").settings.sourceSettingsToggleOption, {
        name: "Languages",
        option: "Japanese",
      }),
    ).toBe("切换 Languages 的 Japanese");
    expect(
      formatMobileString(
        getMobileStrings("ja").settings.editReaderPluginSettings,
        {
          name: "Dual Reader",
        },
      ),
    ).toBe("Dual Reader の設定を編集");
    expect(getMobileStrings("ja").browse.adultSourcesSwitch).toBe(
      "成人向けソース",
    );
    expect(
      formatMobileString(getMobileStrings("zh").sourceManager.addSourceResult, {
        title: "Blue Lock",
        source: "MangaDex",
      }),
    ).toBe("从 MangaDex 添加 Blue Lock");
    expect(
      formatMobileString(getMobileStrings("ja").metadataEditor.applyMatch, {
        provider: "AniList",
      }),
    ).toBe("AniList のメタデータ一致を適用");
    expect(
      formatMobileString(getMobileStrings("en").metadataEditor.applyMatchField, {
        field: "Cover",
        provider: "MAL",
      }),
    ).toBe("Apply Cover from MAL");
    expect(getMobileStrings("en").metadataEditor.chooseCoverImage).toBe(
      "Choose image",
    );
    expect(getMobileStrings("zh").metadataEditor.uploadingCover).toBe(
      "正在上传",
    );
    expect(
      formatMobileString(getMobileStrings("en").metadataEditor.selectStatus, {
        status: "Completed",
      }),
    ).toBe("Set status to Completed");
    expect(
      formatMobileString(getMobileStrings("en").metadataEditor.sourceFetchAccessibility, {
        source: "MangaDex",
      }),
    ).toBe("Fetch metadata from MangaDex");
    expect(
      formatMobileString(getMobileStrings("ja").metadataEditor.resetField, {
        field: "タイトル",
      }),
    ).toBe("タイトルをリセット");
    expect(getMobileStrings("zh").metadataEditor.coverPreview).toBe(
      "封面预览",
    );
    expect(
      formatMobileString(getMobileStrings("zh").mangaDetail.continueChapter, {
        chapter: "第 12 话",
      }),
    ).toBe("继续 第 12 话");
    expect(
      formatMobileString(getMobileStrings("en").mangaDetail.openChapter, {
        chapter: "Chapter 12",
      }),
    ).toBe("Open Chapter 12");
    expect(
      formatMobileString(getMobileStrings("zh").mangaDetail.selectSource, {
        source: "MangaDex",
      }),
    ).toBe("选择 MangaDex");
    expect(getMobileStrings("ja").sourceManga.removeFromLibrary).toBe(
      "ライブラリから削除",
    );
    expect(
      formatMobileString(getMobileStrings("ja").sourceManga.continueChapter, {
        chapter: "第12話",
      }),
    ).toBe("第12話 から続ける");
    expect(
      formatMobileString(getMobileStrings("zh").settings.agentVersion, {
        version: "1.2.3",
      }),
    ).toBe("v1.2.3");
    expect(
      formatMobileString(
        getMobileStrings("ja").settings.cloudSyncContinueWith,
        {
          provider: "Apple",
        },
      ),
    ).toBe("Apple で続ける");
    expect(getMobileStrings("en").settings.cloudSyncKeepDataDescription).toBe(
      "Keep your local library and reading progress on this device.",
    );
    expect(getMobileStrings("zh").settings.cloudSyncRemoveDataDescription).toBe(
      "退出登录后从此设备移除账号书架数据。",
    );
    expect(
      formatMobileString(getMobileStrings("en").settings.sourceUpdated, {
        name: "MangaDex",
      }),
    ).toBe("Updated source: MangaDex");
    expect(
      formatMobileString(getMobileStrings("zh").settings.sourcesUpdated, {
        count: 2,
        names: "A, B",
      }),
    ).toBe("已更新 2 个源：A, B");
    expect(
      formatMobileString(getMobileStrings("ja").settings.sourceUpdated, {
        name: "MangaDex",
      }),
    ).toBe("ソースを更新しました: MangaDex");
    expect(
      formatMobileString(
        getMobileStrings("zh").settings.sourceSettingsDecrease,
        {
          name: "Page gap",
        },
      ),
    ).toBe("减少 Page gap");
    expect(
      formatMobileString(getMobileStrings("en").reader.pageValue, {
        page: 3,
        total: 12,
      }),
    ).toBe("Page 3 of 12");
    expect(
      formatMobileString(getMobileStrings("en").reader.stageAccessibility, {
        page: "Page 3 of 12",
        action: getMobileStrings("en").reader.showControls,
      }),
    ).toBe("Page 3 of 12. Show reader controls");
    expect(
      formatMobileString(
        getMobileStrings("zh").reader.dualReadTargetAccessibility,
        {
          source: "MangaDex",
          detail: `${getMobileStrings("zh").reader.currentChapter} / 第 12 章`,
        },
      ),
    ).toBe("双语阅读 MangaDex：当前 / 第 12 章");
    expect(
      formatMobileString(getMobileStrings("ja").reader.openPlugin, {
        name: "Dual Read",
      }),
    ).toBe("Dual Read リーダープラグインを開く");
    expect(
      formatMobileString(getMobileStrings("zh").reader.chapterAccessibility, {
        direction: getMobileStrings("zh").reader.nextChapter,
        chapter: "第 12 章",
      }),
    ).toBe("下一章：第 12 章");
    expect(
      formatMobileString(
        getMobileStrings("en").sourceBrowse.activeFilterCountOther,
        { count: 3 },
      ),
    ).toBe("3 active filters");
    expect(
      formatMobileString(getMobileStrings("zh").sourceBrowse.openManga, {
        title: "Blue Lock",
      }),
    ).toBe("打开 Blue Lock");
    expect(
      formatMobileString(getMobileStrings("en").sourceBrowse.openListing, {
        title: "Popular",
      }),
    ).toBe("Open Popular listing");
    expect(
      formatMobileString(getMobileStrings("zh").sourceBrowse.openHomeFilter, {
        title: "Latest",
      }),
    ).toBe("应用 Latest 筛选");
    expect(
      formatMobileString(getMobileStrings("ja").sourceBrowse.openLink, {
        title: "Featured",
      }),
    ).toBe("Featured を開く");
    expect(
      formatMobileString(
        getMobileStrings("en").sourceBrowse.sourceFilterOption,
        {
          filter: "Sort",
          option: `Popular, ${getMobileStrings("en").sourceBrowse.sortDescending}`,
        },
      ),
    ).toBe("Sort: Popular, descending");
    expect(
      formatMobileString(
        getMobileStrings("zh").sourceBrowse.sourceFilterTextInput,
        {
          filter: "Author",
        },
      ),
    ).toBe("Author 文本筛选");
    expect(
      formatMobileString(getMobileStrings("ja").sourceBrowse.allFilters, {
        count: 4,
      }),
    ).toBe("4 件すべてのフィルター");
  });

  test("formats setting counts for plural and non-plural languages", () => {
    expect(formatMobileSettingsCount(1, getMobileStrings("en"))).toBe(
      "1 setting",
    );
    expect(formatMobileSettingsCount(2, getMobileStrings("en"))).toBe(
      "2 settings",
    );
    expect(formatMobileSettingsCount(2, getMobileStrings("zh"))).toBe(
      "2 项设置",
    );
    expect(getMobileStrings("zh").metadataEditor.statusCompleted).toBe(
      "已完结",
    );
    expect(
      formatMobileString(
        getMobileStrings("en").mangaDetail.chapterCountLiveOther,
        {
          count: 2,
        },
      ),
    ).toBe("2 live chapters");
    expect(
      formatMobileString(
        getMobileStrings("zh").sourceManga.chapterLoadedOther,
        {
          count: 4,
        },
      ),
    ).toBe("已加载 4 个章节。");
    expect(getMobileStrings("ja").settings.agent).toBe("Nemu Agent");
    expect(
      formatMobileString(getMobileStrings("ja").library.mangaSourceCountOther, {
        count: 3,
      }),
    ).toBe("3 件のソース");
    expect(
      formatMobileString(getMobileStrings("ja").sourceManager.mergeWithTitle, {
        title: "Blue Lock",
      }),
    ).toBe("Blue Lock と統合");
    expect(
      formatMobileString(getMobileStrings("en").reader.pageLoadedOther, {
        count: 8,
      }),
    ).toBe("8 pages loaded.");
    expect(
      formatMobileString(getMobileStrings("zh").reader.pageCountOther, {
        count: 4,
      }),
    ).toBe("4 页");
    expect(getMobileStrings("ja").sourceBrowse.sourceHome).toBe("ホーム");
    expect(getMobileStrings("zh").sourceBrowse.operationAixPackageTitle).toBe(
      "AIX 包",
    );
    expect(getMobileStrings("en").library.collectionNotFoundTitle).toBe(
      "Collection not found",
    );
    expect(getMobileStrings("zh").library.collectionNotFoundDescription).toBe(
      "这个收藏可能已经被删除。",
    );
  });
});
