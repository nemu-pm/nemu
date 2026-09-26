import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  findMobileRegistrySourceForLink,
  getMobileMissingSourceState,
} from "./mobileMissingSourceInstall";

const jumpPlus: MobileRegistrySource = {
  id: "ja.shonenjumpplus",
  registryId: "aidoku-community",
  registryName: "Aidoku Community",
  sourceKind: "aidoku",
  name: "少年ジャンプ＋",
  version: 2,
  downloadUrl: "https://aidoku-community.github.io/sources/sources/ja.shonenjumpplus-v2.aix",
};

const mangadex: MobileRegistrySource = {
  ...jumpPlus,
  id: "multi.mangadex",
  name: "MangaDex",
  version: 14,
  downloadUrl: "https://aidoku-community.github.io/sources/sources/multi.mangadex-v14.aix",
};

const jumpLink = { registryId: "aidoku-community", sourceId: "ja.shonenjumpplus" };

function installed(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:ja.shonenjumpplus",
    registryId: "aidoku-community",
    sourceId: "ja.shonenjumpplus",
    sourceKind: "aidoku",
    name: "少年ジャンプ＋",
    version: 2,
    ...overrides,
  };
}

describe("findMobileRegistrySourceForLink", () => {
  test("finds the catalog entry for a link by registry and source id", () => {
    expect(findMobileRegistrySourceForLink(jumpLink, [mangadex, jumpPlus])).toBe(
      jumpPlus,
    );
  });

  test("accepts a percent-encoded source id", () => {
    expect(
      findMobileRegistrySourceForLink(
        { registryId: "aidoku-community", sourceId: "ja%2Eshonenjumpplus" },
        [jumpPlus],
      ),
    ).toBe(jumpPlus);
  });

  test("never matches another registry with the same source id", () => {
    expect(
      findMobileRegistrySourceForLink(
        { registryId: "aidoku-zh", sourceId: "ja.shonenjumpplus" },
        [jumpPlus],
      ),
    ).toBeNull();
  });

  test("skips Tachiyomi entries and entries without a package URL", () => {
    expect(
      findMobileRegistrySourceForLink(jumpLink, [
        { ...jumpPlus, sourceKind: "tachiyomi" },
      ]),
    ).toBeNull();
    expect(
      findMobileRegistrySourceForLink(jumpLink, [
        { ...jumpPlus, downloadUrl: undefined },
      ]),
    ).toBeNull();
  });
});

describe("getMobileMissingSourceState", () => {
  test("reports installed when an install row matches the link", () => {
    expect(
      getMobileMissingSourceState(jumpLink, [installed()], [jumpPlus]),
    ).toEqual({ status: "installed" });
  });

  test("a disabled install is still installed (the enable flow owns it)", () => {
    expect(
      getMobileMissingSourceState(jumpLink, [installed({ disabled: true })], []),
    ).toEqual({ status: "installed" });
  });

  test("a tombstoned install row counts as missing and offers the catalog entry", () => {
    expect(
      getMobileMissingSourceState(
        jumpLink,
        [installed({ removed: true })],
        [mangadex, jumpPlus],
      ),
    ).toEqual({ status: "missing", candidate: jumpPlus });
  });

  test("missing without a catalog match has no install candidate", () => {
    expect(getMobileMissingSourceState(jumpLink, [], [])).toEqual({
      status: "missing",
      candidate: null,
    });
  });

  test("no selected link yields no state", () => {
    expect(getMobileMissingSourceState(null, [], [jumpPlus])).toBeNull();
  });
});
