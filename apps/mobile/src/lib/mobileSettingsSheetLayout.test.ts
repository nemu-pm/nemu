import { describe, expect, test } from "bun:test";
import type { SourcePackageSetting } from "@/data/schema";
import { getMobileSettingsSheetLayout } from "./mobileSettingsSheetLayout";
import {
  countRenderableSourceSettings,
  countVisibleSourceSettings,
} from "./mobileSourceSettings";

describe("getMobileSettingsSheetLayout", () => {
  test("content-sizes a short settings form in a normal portrait viewport", () => {
    expect(
      getMobileSettingsSheetLayout({
        fontScale: 1,
        height: 844,
        rowCount: 4,
        width: 390,
      }),
    ).toEqual({ scroll: false, snapPoint: undefined });
  });

  test("hugs a moderately long form with a fit-content detent", () => {
    expect(
      getMobileSettingsSheetLayout({
        fontScale: 1,
        height: 844,
        rowCount: 5,
        width: 390,
      }),
    ).toEqual({ scroll: true, snapPoint: 534 });
  });

  test.each([
    { fontScale: 1.5, height: 844, rowCount: 1, width: 390 },
    { fontScale: 1, height: 390, rowCount: 1, width: 844 },
    { fontScale: 1, height: 667, rowCount: 1, width: 375 },
  ])("content-sizes constrained short forms when their content still fits", (input) => {
    expect(getMobileSettingsSheetLayout(input)).toEqual({
      scroll: false,
      snapPoint: undefined,
    });
  });

  test.each([
    { fontScale: 1.5, height: 844, rowCount: 5, width: 390 },
    { fontScale: 1, height: 390, rowCount: 3, width: 844 },
    { fontScale: 1.5, height: 667, rowCount: 4, width: 375 },
  ])("caps accessibility, landscape, and compact forms that would overflow at the max detent", (input) => {
    expect(getMobileSettingsSheetLayout(input)).toEqual({
      scroll: true,
      snapPoint: "82%",
    });
  });

  test("keeps the bounded detent fit-content on a shorter viewport", () => {
    expect(
      getMobileSettingsSheetLayout({
        fontScale: 1,
        height: 700,
        rowCount: 5,
        width: 390,
      }),
    ).toEqual({ scroll: true, snapPoint: 534 });
  });

  describe("MANGA Plus-shaped forms (real multi.mangaplus settings)", () => {
    // The actual aidoku-community multi.mangaplus res/settings.json: two
    // groups, a select + switch, and a Mobile API group whose four text rows
    // are gated behind the "mobile" switch, plus a three-line footer.
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

    test("hugs content with default values: only 3 of 7 declared rows render", () => {
      const visibleRowCount = countVisibleSourceSettings(mangaPlusSettings, {});
      // Declared count was 7, which estimated a "82%" viewport — roughly
      // double the painted content. The rendered form is 3 rows.
      expect(countRenderableSourceSettings(mangaPlusSettings)).toBe(7);
      expect(visibleRowCount).toBe(3);
      expect(
        getMobileSettingsSheetLayout({
          fontScale: 1,
          height: 844,
          rowCount: visibleRowCount,
          width: 390,
        }),
      ).toEqual({ scroll: false, snapPoint: undefined });
    });

    test("caps the form at the bounded detent once the gated rows are visible", () => {
      const visibleRowCount = countVisibleSourceSettings(mangaPlusSettings, {
        mobile: true,
      });
      expect(visibleRowCount).toBe(7);
      // 64pt chrome + 150pt base + 7 × 64pt rows = 662 ≥ 0.78 × 844 → "82%".
      expect(
        getMobileSettingsSheetLayout({
          fontScale: 1,
          height: 844,
          rowCount: visibleRowCount,
          width: 390,
        }),
      ).toEqual({ scroll: true, snapPoint: "82%" });
    });
  });

  describe("MangaDex-shaped forms (richest real source settings)", () => {
    // The aidoku-community multi.mangadex shape: two multi-selects (content
    // rating, excluded tags), an editable list (blocked groups), plain
    // select/switch rows, and an API group whose credential rows are gated
    // behind a switch. On the card, the multi-selects and the list render as
    // ONE compact picker row each (their editor lives in a dedicated
    // sub-sheet), so the 64pt-per-row allowance must cover them without
    // undershooting into a scrolled/82% detent for a form that hugs content.
    const mangadexSettings: SourcePackageSetting[] = [
      {
        type: "group",
        key: "general",
        title: "General",
        items: [
          {
            type: "multi-select",
            key: "contentRating",
            title: "Content Rating",
            values: ["safe", "suggestive", "erotica", "pornographic"],
            titles: ["Safe", "Suggestive", "Erotica", "Pornographic"],
            default: ["safe", "suggestive"],
          },
          {
            type: "multi-select",
            key: "excludedTags",
            title: "Excluded Tags",
            values: [
              "4-koma",
              "award-winning",
              "crossdressing",
              "demons",
              "doujinshi",
              "harem",
              "incest",
              "isekai",
              "magical-girls",
              "onet shot",
              "reverse-harem",
              "shotacon",
              "smut",
              "time-travel",
              "yaoi",
              "yuri",
            ],
            default: ["smut"],
          },
          {
            type: "editable-list",
            key: "blockedGroups",
            title: "Blocked Groups",
            placeholder: "Group UUID",
          },
          {
            type: "switch",
            key: "dataSaver",
            title: "Data Saver",
            default: false,
          },
          {
            type: "select",
            key: "order",
            title: "Chapter Order",
            values: ["desc", "asc"],
            titles: ["Newest first", "Oldest first"],
            default: "desc",
          },
        ],
      },
      {
        type: "group",
        key: "api",
        title: "API",
        items: [
          {
            type: "switch",
            key: "useApi",
            title: "Use Personal API Credentials",
            default: false,
          },
          {
            type: "text",
            key: "clientId",
            title: "Client ID",
            placeholder: "Client ID",
            requires: "useApi",
          },
          {
            type: "text",
            key: "clientSecret",
            title: "Client Secret",
            placeholder: "Client Secret",
            secure: true,
            requires: "useApi",
          },
        ],
        footer: "Create a personal MangaDex API client to use these.",
      },
    ];

    test("hugs content with compact picker rows and gated API rows hidden", () => {
      // 8 declared rows; the two gated credential rows stay hidden with the
      // API switch off, and the two multi-selects plus the editable list
      // paint one compact picker row each — 6 painted rows in total.
      expect(countRenderableSourceSettings(mangadexSettings)).toBe(8);
      const visibleRowCount = countVisibleSourceSettings(mangadexSettings, {});
      expect(visibleRowCount).toBe(6);
      // 64pt chrome + 150pt base + 6 × 64pt rows = 598 < 0.78 × 844 → the
      // sheet gets a content-sized pixel detent instead of the "82%" cap.
      expect(
        getMobileSettingsSheetLayout({
          fontScale: 1,
          height: 844,
          rowCount: visibleRowCount,
          width: 390,
        }),
      ).toEqual({ scroll: true, snapPoint: 598 });
    });

    test("reserves the 82% cap only once every row is actually visible", () => {
      const visibleRowCount = countVisibleSourceSettings(mangadexSettings, {
        useApi: true,
      });
      expect(visibleRowCount).toBe(8);
      // 64pt chrome + 150pt base + 8 × 64pt rows = 726 ≥ 0.78 × 844.
      expect(
        getMobileSettingsSheetLayout({
          fontScale: 1,
          height: 844,
          rowCount: visibleRowCount,
          width: 390,
        }),
      ).toEqual({ scroll: true, snapPoint: "82%" });
    });
  });
});
