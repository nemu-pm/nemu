import { describe, expect, test } from "bun:test";
import {
  assertInstalledSourceSetAdmission,
  compactInstalledSourceTombstone,
  INSTALLED_SOURCE_SET_LIMIT_EXCEEDED,
  MAX_INSTALLED_SOURCE_RECORDS,
  MAX_INSTALLED_SOURCE_SERIALIZED_BYTES,
  measureInstalledSourceSet,
} from "../convex/settingsLimits";

type TestInstalledSource = {
  id: string;
  registryId: string;
  version: number;
  updatedAt: number;
  removed?: boolean;
  name?: string;
  downloadUrl?: string;
};

function source(index: number): TestInstalledSource {
  return {
    id: `registry:source-${index}`,
    registryId: "registry",
    version: 1,
    updatedAt: index + 1,
  };
}

function tombstone(index: number): TestInstalledSource {
  return {
    ...source(index),
    removed: true,
  };
}

describe("Convex installed-source document admission", () => {
  test("accepts the maximum record count and rejects one more", () => {
    const maximum = Array.from(
      { length: MAX_INSTALLED_SOURCE_RECORDS },
      (_, index) => source(index),
    );

    expect(() => assertInstalledSourceSetAdmission([], maximum)).not.toThrow();
    expect(() =>
      assertInstalledSourceSetAdmission([], [
        ...maximum,
        source(MAX_INSTALLED_SOURCE_RECORDS),
      ]),
    ).toThrow(INSTALLED_SOURCE_SET_LIMIT_EXCEEDED);
  });

  test("counts tombstones toward the same bounded LWW set", () => {
    const maximumTombstones = Array.from(
      { length: MAX_INSTALLED_SOURCE_RECORDS },
      (_, index) => tombstone(index),
    );

    expect(() =>
      assertInstalledSourceSetAdmission([], maximumTombstones),
    ).not.toThrow();
    expect(() =>
      assertInstalledSourceSetAdmission([], [
        ...maximumTombstones,
        tombstone(MAX_INSTALLED_SOURCE_RECORDS),
      ]),
    ).toThrow(INSTALLED_SOURCE_SET_LIMIT_EXCEEDED);
  });

  test("rejects a payload before it approaches the Convex document limit", () => {
    const oversized = [{
      ...source(0),
      downloadUrl: `https://example.invalid/${"x".repeat(
        MAX_INSTALLED_SOURCE_SERIALIZED_BYTES,
      )}`,
    }];

    expect(measureInstalledSourceSet(oversized).serializedBytes).toBeGreaterThan(
      MAX_INSTALLED_SOURCE_SERIALIZED_BYTES,
    );
    expect(() => assertInstalledSourceSetAdmission([], oversized)).toThrow(
      INSTALLED_SOURCE_SET_LIMIT_EXCEEDED,
    );
  });

  test("allows idempotent retries of an already oversized legacy set", () => {
    const legacyOversized = Array.from(
      { length: MAX_INSTALLED_SOURCE_RECORDS + 1 },
      (_, index) => tombstone(index),
    );

    expect(() =>
      assertInstalledSourceSetAdmission(legacyOversized, legacyOversized),
    ).not.toThrow();
  });

  test("compacts removal tombstones and allows an oversized set to shrink", () => {
    const active = {
      ...source(0),
      name: "x".repeat(MAX_INSTALLED_SOURCE_SERIALIZED_BYTES),
      downloadUrl: "https://example.invalid/source.aix",
    };
    const removed = compactInstalledSourceTombstone({
      ...active,
      updatedAt: active.updatedAt + 1,
      removed: true,
    });

    expect(removed).toEqual({
      id: active.id,
      registryId: active.registryId,
      version: active.version,
      updatedAt: active.updatedAt + 1,
      removed: true,
    });
    expect(measureInstalledSourceSet([removed]).serializedBytes).toBeLessThan(
      measureInstalledSourceSet([active]).serializedBytes,
    );
    expect(() =>
      assertInstalledSourceSetAdmission([active], [removed]),
    ).not.toThrow();
  });
});
