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
});
