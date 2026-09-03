import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  buildMobileInstalledSourceKeySet,
  canClearMobileBrowseSourceQuery,
  canSelectMobileBrowseAllLanguages,
  canStartMobileSourceInstall,
  filterMobileAvailableSources,
  findMobileInstalledSourceForRegistrySource,
  getMobileAvailableSourceLanguageOptions,
  getMobileInstalledSourceRegistryDisplayName,
  getMobileSourceInstallResultAction,
  getMobileSourceWarningAccessibilityLabel,
  getMobileSourceWarningMessages,
  groupMobileSourcesByLanguage,
  isMobileUnsupportedInstalledSource,
  mergeMobileInstalledSourceRegistryMetadata,
  shouldRenderMobileBrowseSkeleton,
  type MobileBrowseLanguageSource,
  type MobileBrowseSource,
} from "./mobileBrowseSources";

function source(
  id: string,
  overrides: Partial<MobileBrowseSource> = {},
): MobileBrowseSource {
  return {
    id,
    name: id,
    registryName: "Community",
    languages: ["en"],
    ...overrides,
  };
}

function installedSource(
  id: string,
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id,
    registryId: "aidoku-community",
    version: 1,
    ...overrides,
  };
}

function registrySource(
  id: string,
  overrides: Partial<MobileRegistrySource> = {},
): MobileRegistrySource {
  return {
    id,
    registryId: "aidoku-community",
    registryName: "Community",
    name: id,
    version: 1,
    ...overrides,
  };
}

const warningCopy = {
  warningAuthentication: "Requires login.",
  warningCloudflare: "Uses Cloudflare.",
  warningTitle: "Notice",
};

describe("mobile browse source filtering", () => {
  test("filters search text against source metadata", () => {
    const sources = [
      source("one", { name: "Blue Reader", languages: ["en"] }),
      source("two", { name: "Red Reader", registryName: "Blue Registry" }),
      source("three", { name: "Green Reader", languages: ["ja"] }),
    ];

    expect(
      filterMobileAvailableSources(sources, {
        query: "blue",
        showAdult: true,
        appLanguage: "en",
      }).map((item) => item.id),
    ).toEqual(["one", "two"]);
    expect(
      filterMobileAvailableSources(sources, {
        query: "ja",
        showAdult: true,
        appLanguage: "en",
      }).map((item) => item.id),
    ).toEqual(["three"]);
  });

  test("enables clearing source search only while the visible query has content", () => {
    expect(canClearMobileBrowseSourceQuery("")).toBe(false);
    expect(canClearMobileBrowseSourceQuery(" ")).toBe(true);
    expect(canClearMobileBrowseSourceQuery("manga")).toBe(true);
  });

  test("gates the selected all-language chip as a no-op selection", () => {
    expect(canSelectMobileBrowseAllLanguages({ selected: false })).toBe(true);
    expect(canSelectMobileBrowseAllLanguages({ selected: true })).toBe(false);
  });

  test("keeps adult sources hidden until explicitly shown", () => {
    const sources = [
      source("safe", { contentRating: 1 }),
      source("adult", { contentRating: 2 }),
    ];

    expect(
      filterMobileAvailableSources(sources, {
        query: "",
        showAdult: false,
        appLanguage: "en",
      }).map((item) => item.id),
    ).toEqual(["safe"]);
    expect(
      filterMobileAvailableSources(sources, {
        query: "",
        showAdult: true,
        appLanguage: "en",
      }).map((item) => item.id),
    ).toEqual(["safe", "adult"]);
  });

  test("sorts by language priority without capping large registries", () => {
    const sources = Array.from({ length: 100 }, (_, index) =>
      source(`source-${index + 1}`, {
        languages: index === 99 ? ["ja"] : ["fr"],
      }),
    );

    const filtered = filterMobileAvailableSources(sources, {
      query: "",
      showAdult: true,
      appLanguage: "en",
    });

    expect(filtered).toHaveLength(100);
    expect(filtered[0]?.id).toBe("source-100");
    expect(filtered.at(-1)?.id).toBe("source-99");
  });

  test("filters by selected raw source languages", () => {
    const sources = [
      source("english", { languages: ["en"] }),
      source("japanese", { languages: ["ja"] }),
      source("mixed", { languages: ["en", "ja"] }),
      source("unknown", { languages: [] }),
    ];

    expect(
      filterMobileAvailableSources(sources, {
        query: "",
        selectedLanguages: new Set(["ja"]),
        showAdult: true,
        appLanguage: "en",
      }).map((item) => item.id),
    ).toEqual(["japanese", "mixed"]);
    expect(
      filterMobileAvailableSources(sources, {
        query: "",
        selectedLanguages: new Set(["other"]),
        showAdult: true,
        appLanguage: "en",
      }).map((item) => item.id),
    ).toEqual(["unknown"]);
  });

  test("builds language filter options from registry sources", () => {
    const sources = [
      source("french", { languages: ["fr"] }),
      source("unknown", { languages: [] }),
      source("japanese", { languages: ["ja"] }),
      source("english", { languages: ["en"] }),
    ];

    expect(getMobileAvailableSourceLanguageOptions(sources, "zh")).toEqual([
      "ja",
      "en",
      "fr",
      "other",
    ]);
  });

  test("collapses the registry All bucket onto multi in the option list", () => {
    const sources = [
      source("everything", { languages: ["All"] }),
      source("japanese", { languages: ["ja"] }),
      source("chinese", { languages: ["zh"] }),
    ];

    expect(getMobileAvailableSourceLanguageOptions(sources, "en")).toEqual([
      "ja",
      "zh",
      "multi",
    ]);
  });

  test("matches an All source when the multi option is selected", () => {
    const sources = [
      source("everything", { languages: ["All"] }),
      source("japanese", { languages: ["ja"] }),
    ];

    expect(
      filterMobileAvailableSources(sources, {
        query: "",
        selectedLanguages: ["multi"],
        showAdult: true,
        appLanguage: "en",
      }).map((entry) => entry.id),
    ).toEqual(["everything"]);
  });

  test("groups filtered sources by language priority and source name", () => {
    const sources = [
      source("french-z", { name: "Zed", languages: ["fr"] }),
      source("japanese-b", { name: "Bento", languages: ["ja"] }),
      source("english", { name: "Atlas", languages: ["en"] }),
      source("japanese-a", { name: "Akari", languages: ["ja"] }),
      source("mixed", { name: "Mix", languages: ["en", "ja"] }),
      source("unknown", { name: "Other", languages: [] }),
    ];

    const sections = groupMobileSourcesByLanguage(sources, "zh", {
      sortSourcesByName: true,
    });

    expect(sections.map((section) => section.label)).toEqual([
      "ja",
      "en",
      "multi",
      "fr",
      "other",
    ]);
    expect(sections[0]?.sources.map((item) => item.id)).toEqual([
      "japanese-a",
      "japanese-b",
    ]);
  });

  test("groups installed source card models without registry metadata", () => {
    const sources: MobileBrowseLanguageSource[] = [
      { id: "en-b", name: "Beta", languages: ["en"] },
      { id: "ja", name: "Akari", languages: ["ja"] },
      { id: "en-a", name: "Atlas", languages: ["en"] },
    ];

    const sections = groupMobileSourcesByLanguage(sources, "en");

    expect(sections.map((section) => section.label)).toEqual(["ja", "en"]);
    expect(sections[1]?.sources.map((item) => item.id)).toEqual(["en-b", "en-a"]);
  });

  test("builds installed keys for current and older bare source records", () => {
    const keys = buildMobileInstalledSourceKeySet([
      installedSource("aidoku-community:en.current", { sourceId: "en.current" }),
      installedSource("en.legacy", { sourceId: "en.legacy" }),
      installedSource("aidoku-community:registry-id", { sourceId: "manifest.id" }),
    ]);

    expect(keys.has("aidoku-community:en.current")).toBe(true);
    expect(keys.has("en.legacy")).toBe(true);
    expect(keys.has("aidoku-community:en.legacy")).toBe(true);
    expect(keys.has("aidoku-community:registry-id")).toBe(true);
    expect(keys.has("aidoku-community:manifest.id")).toBe(true);
  });

  test("finds installed source records by registry aliases", () => {
    const current = installedSource("aidoku-community:en.current", {
      sourceId: "en.current",
    });
    const bare = installedSource("en.legacy", {
      sourceId: "manifest.id",
    });
    const registryAlias = installedSource("aidoku-community:registry-id", {
      sourceId: "manifest.id",
    });
    const sources = [current, bare, registryAlias];

    expect(
      findMobileInstalledSourceForRegistrySource(
        sources,
        registrySource("en.current"),
      ),
    ).toBe(current);
    expect(
      findMobileInstalledSourceForRegistrySource(
        sources,
        registrySource("en.legacy"),
      ),
    ).toBe(bare);
    expect(
      findMobileInstalledSourceForRegistrySource(
        sources,
        registrySource("registry-id"),
      ),
    ).toBe(registryAlias);
    expect(
      findMobileInstalledSourceForRegistrySource(
        sources,
        registrySource("missing"),
      ),
    ).toBeNull();
  });

  test("resolves installed display names by registry aliases", () => {
    const bare = installedSource("en.legacy", {
      name: "Installed Legacy",
      sourceId: "manifest.id",
    });
    const registryAlias = installedSource("aidoku-community:registry-id", {
      name: "Installed Registry Alias",
      sourceId: "manifest.id",
    });
    const sources = [bare, registryAlias];

    expect(
      getMobileInstalledSourceRegistryDisplayName(
        sources,
        registrySource("en.legacy", { name: "Registry Legacy" }),
      ),
    ).toBe("Installed Legacy");
    expect(
      getMobileInstalledSourceRegistryDisplayName(
        sources,
        registrySource("registry-id", { name: "Registry Alias" }),
      ),
    ).toBe("Installed Registry Alias");
    expect(
      getMobileInstalledSourceRegistryDisplayName(
        sources,
        registrySource("missing", { name: "Registry Missing" }),
      ),
    ).toBe("Registry Missing");
  });

  test("enriches installed source presentation from registry metadata", () => {
    const installed = installedSource("en.legacy", {
      name: "Old name",
      icon: "old.png",
      languages: ["en"],
      packageMetadata: {
        sourceId: "en.legacy",
        name: "Old package",
        version: 4,
        languages: ["en"],
        listings: [],
        filters: [],
        settings: [],
        hasWasm: true,
      },
      version: 4,
    });

    const [merged] = mergeMobileInstalledSourceRegistryMetadata(
      [installed],
      [
        registrySource("en.legacy", {
          name: "Fresh Registry Name",
          icon: "fresh.png",
          languages: ["ja"],
          contentRating: 1,
          hasCloudflare: true,
          downloadUrl: "https://example.test/fresh.aix",
          version: 9,
        }),
      ],
    );

    expect(merged).toMatchObject({
      id: "en.legacy",
      registryId: "aidoku-community",
      sourceId: "en.legacy",
      name: "Fresh Registry Name",
      icon: "fresh.png",
      languages: ["ja"],
      contentRating: 1,
      hasCloudflare: true,
      downloadUrl: "https://example.test/fresh.aix",
      version: 4,
      packageMetadata: installed.packageMetadata,
    });
  });

  test("matches registry metadata by installed id when package source id differs", () => {
    const installed = installedSource("aidoku-community:registry-id", {
      sourceId: "manifest.id",
      name: "Manifest name",
      version: 4,
    });

    const [merged] = mergeMobileInstalledSourceRegistryMetadata(
      [installed],
      [
        registrySource("registry-id", {
          name: "Registry Name",
          icon: "registry.png",
          languages: ["ja"],
          downloadUrl: "https://example.test/registry.aix",
        }),
      ],
    );

    expect(merged).toMatchObject({
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      name: "Registry Name",
      icon: "registry.png",
      languages: ["ja"],
      downloadUrl: "https://example.test/registry.aix",
    });
  });

  test("preserves registry source kind during metadata refresh", () => {
    const installed = installedSource("tachiyomi-community:en.example", {
      registryId: "tachiyomi-community",
      sourceId: "en.example",
      name: "Old name",
      version: 1,
    });

    const [merged] = mergeMobileInstalledSourceRegistryMetadata(
      [installed],
      [
        registrySource("en.example", {
          registryId: "tachiyomi-community",
          sourceKind: "tachiyomi",
          name: "Fresh name",
        }),
      ],
    );

    expect(merged).toMatchObject({
      id: "tachiyomi-community:en.example",
      registryId: "tachiyomi-community",
      sourceKind: "tachiyomi",
      sourceId: "en.example",
      name: "Fresh name",
    });
  });

  test("fills missing installed package metadata from registry metadata", () => {
    const installed = installedSource("tachiyomi-local:example-extension", {
      registryId: "tachiyomi-local",
      sourceKind: "tachiyomi",
      sourceId: "example-extension",
      name: "Old name",
      version: 1,
    });
    const packageMetadata = {
      sourceId: "example-extension",
      name: "Example Extension",
      version: 1,
      listings: [{ id: "popular", name: "Popular" }],
      filters: [],
      settings: [
        {
          key: "__selected_source_id__",
          title: "Source",
          type: "select",
          values: ["en.example", "ja.example"],
          titles: ["Example (en)", "Example JA (ja)"],
          default: "en.example",
          refreshes: ["content", "listings", "filters"],
        },
      ],
      hasWasm: false,
    } satisfies NonNullable<MobileRegistrySource["packageMetadata"]>;

    const [merged] = mergeMobileInstalledSourceRegistryMetadata(
      [installed],
      [
        registrySource("example-extension", {
          registryId: "tachiyomi-local",
          sourceKind: "tachiyomi",
          name: "Fresh name",
          packageMetadata,
        }),
      ],
    );

    expect(merged).toMatchObject({
      id: "tachiyomi-local:example-extension",
      name: "Fresh name",
      packageMetadata,
    });
  });

  test("keeps installed source records unchanged without registry metadata", () => {
    const installed = installedSource("aidoku-community:missing", {
      sourceId: "missing",
      name: "Local only",
    });

    const [merged] = mergeMobileInstalledSourceRegistryMetadata(
      [installed],
      [registrySource("other")],
    );

    expect(merged).toBe(installed);
  });

  test("blocks source install starts while another install is active", () => {
    expect(canStartMobileSourceInstall("aidoku-community:en.first", null)).toBe(
      true,
    );
    expect(canStartMobileSourceInstall("aidoku-community:en.first", "")).toBe(
      true,
    );
    expect(
      canStartMobileSourceInstall(
        "aidoku-community:en.first",
        "aidoku-community:en.first",
      ),
    ).toBe(false);
    expect(
      canStartMobileSourceInstall(
        "aidoku-community:en.second",
        "aidoku-community:en.first",
      ),
    ).toBe(false);
    expect(canStartMobileSourceInstall("", null)).toBe(false);
  });

  test("keeps failed warning installs retryable from the confirmation sheet", () => {
    expect(getMobileSourceInstallResultAction({ succeeded: true })).toBe(
      "close-confirmation",
    );
    expect(getMobileSourceInstallResultAction({ succeeded: false })).toBe(
      "keep-confirmation-open",
    );
  });

  test("matches web warning metadata for source install rows", () => {
    expect(
      getMobileSourceWarningMessages(
        registrySource("plain"),
        warningCopy,
      ),
    ).toEqual([]);
    expect(
      getMobileSourceWarningMessages(
        registrySource("login", { hasAuthentication: true }),
        warningCopy,
      ),
    ).toEqual(["Requires login."]);
    expect(
      getMobileSourceWarningMessages(
        registrySource("guarded", {
          hasAuthentication: true,
          hasCloudflare: true,
        }),
        warningCopy,
      ),
    ).toEqual(["Requires login.", "Uses Cloudflare."]);
  });

  test("builds native accessibility text for warning source badges", () => {
    expect(
      getMobileSourceWarningAccessibilityLabel(
        registrySource("plain", { name: "Plain Reader" }),
        warningCopy,
      ),
    ).toBeNull();
    expect(
      getMobileSourceWarningAccessibilityLabel(
        registrySource("guarded", {
          name: "Guarded Reader",
          hasAuthentication: true,
          hasCloudflare: true,
        }),
        warningCopy,
      ),
    ).toBe("Guarded Reader. Notice. Requires login. Uses Cloudflare.");
  });

  test("matches web by showing a full browse skeleton only during unresolved initial load", () => {
    expect(
      shouldRenderMobileBrowseSkeleton({
        loading: true,
        installedCount: 0,
        availableCount: 0,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileBrowseSkeleton({
        loading: true,
        installedCount: 1,
        availableCount: 0,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileBrowseSkeleton({
        loading: true,
        installedCount: 0,
        availableCount: 1,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileBrowseSkeleton({
        loading: true,
        installedCount: 0,
        availableCount: 0,
        hasError: true,
      }),
    ).toBe(false);
  });

  test("flags installed sources whose runtime this build cannot execute", () => {
    // Tachiyomi records reach mobile through cloud sync; browse and settings
    // rows have to mark them instead of failing only once the user taps.
    expect(
      isMobileUnsupportedInstalledSource({
        id: "tachiyomi-local:en.example",
        registryId: "tachiyomi-local",
        sourceKind: "tachiyomi",
      }),
    ).toBe(true);
    expect(
      isMobileUnsupportedInstalledSource({
        id: "tachiyomi-local:en.example",
        registryId: "",
        sourceKind: undefined,
      }),
    ).toBe(true);
    expect(
      isMobileUnsupportedInstalledSource({
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        sourceKind: "aidoku",
      }),
    ).toBe(false);
  });
});
