import { describe, expect, test } from "bun:test";
import { assertAidokuSourcePackageIdentity } from "./sourcePackageCacheTypes";

describe("Aidoku package identity validation", () => {
  const source = { id: "en.example", version: 14 };

  test("accepts the exact registry identity and version", () => {
    expect(() =>
      assertAidokuSourcePackageIdentity(source, {
        sourceId: "en.example",
        version: 14,
      }),
    ).not.toThrow();
  });

  test("rejects package substitution and stale versions", () => {
    expect(() =>
      assertAidokuSourcePackageIdentity(source, {
        sourceId: "en.other",
        version: 14,
      }),
    ).toThrow("identity or version");
    expect(() =>
      assertAidokuSourcePackageIdentity(source, {
        sourceId: "en.example",
        version: 13,
      }),
    ).toThrow("identity or version");
  });
});
