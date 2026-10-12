import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  applyMobileCatalogEntryToInstalledSource,
  findMobileCatalogEntryForInstalledSource,
  findMobileSourceCatalogRepairs,
  mobileInstalledSourceNeedsCatalogRepair,
} from "./mobileInstalledSourceCatalogRepair";

// Records as they sit in a fresh install's DB after sign-in sync.
const bare = (id: string, version = 1): InstalledSource => ({
  id: `aidoku-community:${id}`,
  registryId: "aidoku-community",
  version,
  updatedAt: 1786125697738,
  removed: false,
});

const entry = (id: string, version = 1): MobileRegistrySource => ({
  id,
  registryId: "aidoku-community",
  registryName: "Aidoku Community",
  name: id === "ja.raw1001" ? "Raw1001" : id,
  version,
  icon: `https://example.test/icons/${id}-v${version}.png`,
  downloadUrl: `https://example.test/sources/${id}-v${version}.aix`,
  languages: ["ja"],
});

describe("mobileInstalledSourceNeedsCatalogRepair", () => {
  test("flags live aidoku records that have no package URL", () => {
    expect(mobileInstalledSourceNeedsCatalogRepair(bare("ja.raw1001"))).toBe(true);
    expect(
      mobileInstalledSourceNeedsCatalogRepair({
        ...bare("ja.raw1001"),
        downloadUrl: "https://example.test/sources/ja.raw1001-v1.aix",
      }),
    ).toBe(false);
    expect(
      mobileInstalledSourceNeedsCatalogRepair({ ...bare("ja.soraraw"), removed: true }),
    ).toBe(false);
    expect(
      mobileInstalledSourceNeedsCatalogRepair({ ...bare("ja.x"), disabled: true }),
    ).toBe(false);
    expect(
      mobileInstalledSourceNeedsCatalogRepair({
        ...bare("ext"),
        sourceKind: "tachiyomi",
      }),
    ).toBe(false);
  });
});

describe("findMobileSourceCatalogRepairs", () => {
  test("matches bare records to catalog entries across registries", () => {
    const catalog = [
      entry("ja.raw1001"),
      entry("ja.comicaction"),
      { ...entry("zh.mkzhan"), registryId: "aidoku-zh" },
      entry("zh.copymanga", 21),
    ];
    const installed = [
      bare("ja.raw1001"),
      bare("ja.comicaction"),
      { ...bare("zh.mkzhan"), id: "aidoku-zh:zh.mkzhan", registryId: "aidoku-zh" },
      // Complete record: not a repair.
      {
        ...bare("zh.copymanga", 21),
        downloadUrl: "https://example.test/sources/zh.copymanga-v21.aix",
      },
      // Not in the catalog any more: nothing to install.
      bare("ja.gone"),
    ];

    expect(
      findMobileSourceCatalogRepairs(installed, catalog).map(
        (item) => `${item.registryId}:${item.id}`,
      ),
    ).toEqual([
      "aidoku-community:ja.raw1001",
      "aidoku-community:ja.comicaction",
      "aidoku-zh:zh.mkzhan",
    ]);
  });

  test("ignores catalog entries without a download URL", () => {
    expect(
      findMobileCatalogEntryForInstalledSource(bare("ja.raw1001"), [
        { ...entry("ja.raw1001"), downloadUrl: undefined },
      ]),
    ).toBeNull();
  });
});

describe("applyMobileCatalogEntryToInstalledSource", () => {
  test("fills missing identity and display fields without touching the clock", () => {
    expect(
      applyMobileCatalogEntryToInstalledSource(bare("ja.raw1001"), entry("ja.raw1001")),
    ).toEqual({
      id: "aidoku-community:ja.raw1001",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "ja.raw1001",
      name: "Raw1001",
      icon: "https://example.test/icons/ja.raw1001-v1.png",
      languages: ["ja"],
      contentRating: undefined,
      downloadUrl: "https://example.test/sources/ja.raw1001-v1.aix",
      version: 1,
      updatedAt: 1786125697738,
      removed: false,
    });
  });

  test("keeps existing fields and drops a package cached for another version", () => {
    const repaired = applyMobileCatalogEntryToInstalledSource(
      {
        ...bare("ja.rawdevart", 2),
        name: "My Rawdevart",
        packageUri: "file:///old.aix",
        packageCacheKey: `aix:${"c".repeat(64)}`,
      },
      entry("ja.rawdevart", 3),
    );
    expect(repaired.name).toBe("My Rawdevart");
    expect(repaired.version).toBe(3);
    expect(repaired.packageUri).toBeNull();
    expect(repaired.packageCacheKey).toBeNull();
    expect(repaired.packageMetadata).toBeNull();
  });
});
