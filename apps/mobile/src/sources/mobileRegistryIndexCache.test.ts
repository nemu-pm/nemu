import { describe, expect, test } from "bun:test";
import {
  clearCachedRegistryIndex,
  decodeRegistryIndexCache,
  encodeRegistryIndexCache,
  isMobileRegistrySourceShape,
  loadCachedRegistryIndex,
  saveCachedRegistryIndex,
} from "./mobileRegistryIndexCache";
import type { MobileRegistrySource } from "./aidokuRegistry";

function source(overrides: Partial<MobileRegistrySource> = {}) {
  return {
    id: "en.example",
    registryId: "aidoku-community",
    registryName: "Aidoku Community",
    name: "Example",
    version: 3,
    languages: ["en"],
    ...overrides,
  } as MobileRegistrySource;
}

describe("registry index cache codec", () => {
  test("round-trips a source list", () => {
    const sources = [source(), source({ id: "ja.other", version: 7 })];
    const decoded = decodeRegistryIndexCache(encodeRegistryIndexCache(sources));
    expect(decoded).toEqual(sources);
  });

  test("rejects invalid JSON", () => {
    expect(decodeRegistryIndexCache("{not json")).toBeNull();
  });

  test("rejects unknown payload versions", () => {
    const raw = JSON.stringify({ v: 99, sources: [source()] });
    expect(decodeRegistryIndexCache(raw)).toBeNull();
  });

  test("rejects non-array payloads and empty catalogs", () => {
    expect(decodeRegistryIndexCache(JSON.stringify({ v: 1 }))).toBeNull();
    expect(decodeRegistryIndexCache(JSON.stringify({ v: 1, sources: [] }))).toBeNull();
  });

  test("drops corrupt entries instead of the whole catalog", () => {
    const raw = JSON.stringify({
      v: 1,
      sources: [
        { id: "bad", registryId: 5, name: "nope" },
        source(),
        "junk",
      ],
    });
    expect(decodeRegistryIndexCache(raw)).toEqual([source()]);
  });

  test("rejects catalogs with no surviving valid entries", () => {
    const raw = JSON.stringify({ v: 1, sources: [{ garbage: true }] });
    expect(decodeRegistryIndexCache(raw)).toBeNull();
  });

  test("validates entry shape", () => {
    expect(isMobileRegistrySourceShape(source())).toBe(true);
    expect(isMobileRegistrySourceShape({ id: "x" })).toBe(false);
    expect(isMobileRegistrySourceShape(null)).toBe(false);
    expect(isMobileRegistrySourceShape([source()])).toBe(false);
    expect(
      isMobileRegistrySourceShape(source({ version: Number.NaN })),
    ).toBe(false);
    expect(isMobileRegistrySourceShape(source({ version: -1 }))).toBe(false);
  });
});

describe("registry index cache store", () => {
  test("stores and reloads a persisted catalog", async () => {
    await clearCachedRegistryIndex();
    expect(await loadCachedRegistryIndex()).toBeNull();

    const sources = [source(), source({ id: "ja.other" })];
    await saveCachedRegistryIndex(sources);
    expect(await loadCachedRegistryIndex()).toEqual(sources);

    await clearCachedRegistryIndex();
    expect(await loadCachedRegistryIndex()).toBeNull();
  });

  test("refuses to persist an empty catalog", async () => {
    await clearCachedRegistryIndex();
    await saveCachedRegistryIndex([]);
    expect(await loadCachedRegistryIndex()).toBeNull();
  });
});
