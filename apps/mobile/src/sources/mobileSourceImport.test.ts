import { describe, expect, test } from "bun:test";
import {
  MOBILE_CUSTOM_AIDOKU_REGISTRY_ID,
  buildImportedAixInstalledSource,
  installedSourceFromImportedAixMetadata,
} from "./mobileSourceImport";

const metadata = {
  sourceId: "en.example",
  name: "Example Source",
  version: 7,
  languages: ["en"],
  contentRating: 0,
  listings: [],
  filters: [],
  settings: [],
  hasWasm: true,
};

describe("mobile source import", () => {
  test("creates a registry-compatible installed source for imported AIX metadata", () => {
    expect(
      installedSourceFromImportedAixMetadata({
        metadata,
        packageUri: "file:///cache/en.example.aix",
        packageCacheKey: "aix:custom-aidoku:en.example",
        now: 1234,
      }),
    ).toEqual({
      id: `${MOBILE_CUSTOM_AIDOKU_REGISTRY_ID}:en.example`,
      registryId: MOBILE_CUSTOM_AIDOKU_REGISTRY_ID,
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example Source",
      languages: ["en"],
      contentRating: 0,
      packageUri: "file:///cache/en.example.aix",
      packageCacheKey: "aix:custom-aidoku:en.example",
      packageMetadata: metadata,
      version: 7,
      updatedAt: 1234,
      removed: false,
    });
  });

  test("requires extracted package metadata", () => {
    expect(() =>
      buildImportedAixInstalledSource({
        packageResult: {
          packageUri: "file:///cache/source.aix",
          packageCacheKey: "aix:custom-aidoku:source",
          metadata: null,
        },
      }),
    ).toThrow("metadata");
  });
});
