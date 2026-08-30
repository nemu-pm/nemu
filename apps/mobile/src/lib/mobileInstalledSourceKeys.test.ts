import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import {
  getMobileInstalledSourceRegistryKey,
  getMobileInstalledSourceRegistryRef,
  getMobileInstalledSourceRegistryKeys,
  getMobileInstalledSourceSettingsKeys,
  getMobileSourceLinkRegistryKeys,
  mobileInstalledSourceMatchesLink,
  mobileInstalledSourceMatchesRoute,
} from "./mobileInstalledSourceKeys";

function installed(
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

describe("mobile installed source keys", () => {
  test("uses the installed composite id as the registry key", () => {
    const source = installed("aidoku-community:registry-id", {
      sourceId: "manifest.id",
    });

    expect(getMobileInstalledSourceRegistryKey(source)).toBe(
      "aidoku-community:registry-id",
    );
    expect(getMobileInstalledSourceRegistryRef(source)).toEqual({
      registryId: "aidoku-community",
      sourceId: "registry-id",
    });
  });

  test("keeps legacy bare ids and runtime source ids available for cleanup", () => {
    const source = installed("en.legacy", {
      sourceId: "manifest.id",
    });

    expect(getMobileInstalledSourceRegistryKeys(source)).toEqual([
      "en.legacy",
      "aidoku-community:manifest.id",
      "aidoku-community:en.legacy",
    ]);
    expect(getMobileInstalledSourceSettingsKeys(source)).toEqual([
      "en.legacy",
      "aidoku-community:manifest.id",
      "aidoku-community:en.legacy",
    ]);
    expect(getMobileInstalledSourceRegistryRef(source)).toEqual({
      registryId: "aidoku-community",
      sourceId: "manifest.id",
    });
  });

  test("matches route params against registry and runtime source ids", () => {
    const source = installed("aidoku-community:registry-id", {
      sourceId: "manifest.id",
    });

    expect(
      mobileInstalledSourceMatchesRoute(source, "aidoku-community", "registry-id"),
    ).toBe(true);
    expect(
      mobileInstalledSourceMatchesRoute(source, "aidoku-community", "manifest.id"),
    ).toBe(true);
    expect(
      mobileInstalledSourceMatchesRoute(source, "aidoku-community", "missing"),
    ).toBe(false);
  });

  test("normalizes encoded installed source ids before route matching", () => {
    const source = installed("aidoku-community:registry%3Aid", {
      sourceId: "manifest.id",
    });

    expect(getMobileInstalledSourceRegistryKey(source)).toBe(
      "aidoku-community:registry:id",
    );
    expect(getMobileInstalledSourceRegistryRef(source)).toEqual({
      registryId: "aidoku-community",
      sourceId: "registry:id",
    });
    expect(
      mobileInstalledSourceMatchesRoute(source, "aidoku-community", "registry:id"),
    ).toBe(true);
    expect(
      mobileInstalledSourceMatchesRoute(source, "aidoku-community", "manifest.id"),
    ).toBe(true);
  });

  test("matches source links against registry and runtime source ids", () => {
    const source = installed("aidoku-community:registry-id", {
      sourceId: "manifest.id",
    });

    expect(
      mobileInstalledSourceMatchesLink(source, {
        registryId: "aidoku-community",
        sourceId: "manifest.id",
      }),
    ).toBe(true);
    expect(
      mobileInstalledSourceMatchesLink(source, {
        registryId: "aidoku-community",
        sourceId: "registry-id",
      }),
    ).toBe(true);
  });

  test("matches older bare installed ids within the route registry", () => {
    const source = installed("en.legacy", {
      sourceId: "manifest.id",
    });

    expect(
      mobileInstalledSourceMatchesRoute(source, "aidoku-community", "en.legacy"),
    ).toBe(true);
    expect(
      mobileInstalledSourceMatchesLink(source, {
        registryId: "aidoku-community",
        sourceId: "en.legacy",
      }),
    ).toBe(true);
  });

  test("matches encoded route source ids with path separators", () => {
    const source = installed("tachiyomi-local:en%2Fexample", {
      registryId: "tachiyomi-local",
      sourceId: "en/example",
    });

    expect(
      mobileInstalledSourceMatchesRoute(source, "tachiyomi-local", "en%2Fexample"),
    ).toBe(true);
    expect(
      mobileInstalledSourceMatchesRoute(source, "tachiyomi-local", "en/example"),
    ).toBe(true);
  });

  test("builds source link keys across registry and runtime aliases", () => {
    const source = installed("aidoku-community:registry-id", {
      sourceId: "manifest.id",
    });

    expect(
      getMobileSourceLinkRegistryKeys(
        {
          registryId: "aidoku-community",
          sourceId: "registry-id",
        },
        source,
      ),
    ).toEqual([
      "aidoku-community:registry-id",
      "aidoku-community:manifest.id",
    ]);
  });

  test("builds source link keys for older bare installed ids", () => {
    const source = installed("en.legacy", {
      sourceId: "manifest.id",
    });

    expect(
      getMobileSourceLinkRegistryKeys(
        {
          registryId: "aidoku-community",
          sourceId: "en.legacy",
        },
        source,
      ),
    ).toEqual([
      "aidoku-community:en.legacy",
      "aidoku-community:manifest.id",
    ]);
  });
});
