import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  findMobileSourceUpdates,
  getInstalledSourceUpdateKey,
} from "./mobileSourceUpdates";

function installed(
  id: string,
  version: number,
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id,
    registryId: id.split(":")[0] ?? "registry",
    version,
    ...overrides,
  };
}

function available(
  registryId: string,
  id: string,
  version: number,
): MobileRegistrySource {
  return {
    id,
    registryId,
    registryName: registryId,
    name: id,
    version,
  };
}

describe("mobile source update helpers", () => {
  test("normalizes installed source keys before comparing registry updates", () => {
    expect(
      getInstalledSourceUpdateKey(
        installed("en.legacy", 1, {
          registryId: "aidoku-community",
          sourceId: "en.legacy",
        }),
      ),
    ).toBe("aidoku-community:en.legacy");
  });

  test("uses the registry id from the installed key when manifest source ids differ", () => {
    expect(
      getInstalledSourceUpdateKey(
        installed("aidoku-community:registry-id", 1, {
          sourceId: "manifest.id",
        }),
      ),
    ).toBe("aidoku-community:registry-id");
  });

  test("finds registry sources newer than installed versions", () => {
    const updates = findMobileSourceUpdates(
      [
        installed("aidoku-community:en.current", 4),
        installed("aidoku-community:en.old", 2),
      ],
      [
        available("aidoku-community", "en.current", 4),
        available("aidoku-community", "en.old", 3),
        available("aidoku-community", "en.missing", 9),
      ],
    );

    expect(updates.map((source) => source.id)).toEqual(["en.old"]);
  });

  test("finds updates for older installed records that used bare source ids", () => {
    const updates = findMobileSourceUpdates(
      [
        installed("en.legacy", 1, {
          registryId: "aidoku-community",
          sourceId: "en.legacy",
        }),
      ],
      [available("aidoku-community", "en.legacy", 2)],
    );

    expect(updates.map((source) => source.id)).toEqual(["en.legacy"]);
  });

  test("finds updates when the package manifest source id differs from the registry id", () => {
    const updates = findMobileSourceUpdates(
      [
        installed("aidoku-community:registry-id", 1, {
          sourceId: "manifest.id",
        }),
      ],
      [available("aidoku-community", "registry-id", 2)],
    );

    expect(updates.map((source) => source.id)).toEqual(["registry-id"]);
  });

  test("ignores removed installed source tombstones", () => {
    expect(
      findMobileSourceUpdates(
        [installed("aidoku-community:en.removed", 1, { removed: true })],
        [available("aidoku-community", "en.removed", 2)],
      ),
    ).toEqual([]);
  });

  test("does not auto-update a disabled source", () => {
    expect(
      findMobileSourceUpdates(
        [installed("aidoku-community:en.off", 1, { disabled: true })],
        [available("aidoku-community", "en.off", 2)],
      ),
    ).toEqual([]);

    // Re-enabling puts it back in the update pass.
    expect(
      findMobileSourceUpdates(
        [installed("aidoku-community:en.off", 1, { disabled: false })],
        [available("aidoku-community", "en.off", 2)],
      ).map((source) => source.id),
    ).toEqual(["en.off"]);
  });

  test("only the directory a source was installed from can update it", () => {
    const installedSources = [
      installed("dir-aaaaaaaaaaaa:en.same", 1),
      installed("nemu-recommended:en.same", 1),
    ];
    // Same source id published by two directories: each install follows its own.
    expect(
      findMobileSourceUpdates(installedSources, [
        available("dir-aaaaaaaaaaaa", "en.same", 2),
      ]).map((source) => source.registryId),
    ).toEqual(["dir-aaaaaaaaaaaa"]);
    // A removed or disabled directory is not in the catalog: nothing updates,
    // and the installed source is left exactly as it was.
    expect(findMobileSourceUpdates(installedSources, [])).toEqual([]);
    // A directory listing a source that is not installed never installs it.
    expect(
      findMobileSourceUpdates(
        [],
        [available("nemu-recommended", "multi.peppercarrot", 5)],
      ),
    ).toEqual([]);
  });

  test("an imported .aix file has no update origin", () => {
    expect(
      findMobileSourceUpdates(
        [installed("custom-aidoku:en.local", 1)],
        [available("aidoku-community", "en.local", 9)],
      ),
    ).toEqual([]);
  });
});
