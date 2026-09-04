import { describe, expect, it } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import {
  buildMobileSourceIconIndex,
  normalizeMobileSourceIconUri,
  resolveMobileInstalledSourceIconUri,
} from "./mobileSourceIconResolution";

const ICON = "https://aidoku-community.github.io/sources/icons/ja.rawkuma-v6.png";

function installed(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:ja.rawkuma",
    registryId: "aidoku-community",
    sourceId: "ja.rawkuma",
    name: "Rawkuma",
    version: 6,
    ...overrides,
  };
}

describe("normalizeMobileSourceIconUri", () => {
  it("keeps http(s) urls", () => {
    expect(normalizeMobileSourceIconUri(ICON)).toBe(ICON);
    expect(normalizeMobileSourceIconUri("http://example.test/a.png")).toBe(
      "http://example.test/a.png",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeMobileSourceIconUri(`  ${ICON}  `)).toBe(ICON);
  });

  it("rejects empty, relative, and non-http schemes", () => {
    expect(normalizeMobileSourceIconUri(undefined)).toBeNull();
    expect(normalizeMobileSourceIconUri(null)).toBeNull();
    expect(normalizeMobileSourceIconUri("   ")).toBeNull();
    expect(normalizeMobileSourceIconUri("icons/ja.rawkuma-v6.png")).toBeNull();
    expect(normalizeMobileSourceIconUri("file:///tmp/icon.png")).toBeNull();
    expect(
      normalizeMobileSourceIconUri("data:image/png;base64,AAAA"),
    ).toBeNull();
  });
});

describe("buildMobileSourceIconIndex", () => {
  it("keys entries by registry source key and drops unusable icons", () => {
    const index = buildMobileSourceIconIndex([
      { id: "ja.rawkuma", registryId: "aidoku-community", icon: ICON },
      { id: "ja.raw1001", registryId: "aidoku-community", icon: "icons/x.png" },
      { id: "ja.rawdevart", registryId: "aidoku-community" },
    ]);
    expect(index.get("aidoku-community:ja.rawkuma")).toBe(ICON);
    expect(index.size).toBe(1);
  });

  it("tolerates a missing catalog", () => {
    expect(buildMobileSourceIconIndex(null).size).toBe(0);
    expect(buildMobileSourceIconIndex(undefined).size).toBe(0);
  });
});

describe("resolveMobileInstalledSourceIconUri", () => {
  it("prefers the installed record's own icon", () => {
    expect(
      resolveMobileInstalledSourceIconUri(installed({ icon: ICON }), [
        {
          id: "ja.rawkuma",
          registryId: "aidoku-community",
          icon: "https://example.test/other.png",
        },
      ]),
    ).toBe(ICON);
  });

  it("falls back to the registry catalog entry when the record has none", () => {
    expect(
      resolveMobileInstalledSourceIconUri(installed(), [
        { id: "ja.rawkuma", registryId: "aidoku-community", icon: ICON },
      ]),
    ).toBe(ICON);
  });

  it("falls back when the record's own icon is unusable", () => {
    expect(
      resolveMobileInstalledSourceIconUri(installed({ icon: "icons/x.png" }), [
        { id: "ja.rawkuma", registryId: "aidoku-community", icon: ICON },
      ]),
    ).toBe(ICON);
  });

  it("matches a record whose id is the bare source id", () => {
    expect(
      resolveMobileInstalledSourceIconUri(
        installed({ id: "ja.rawkuma", sourceId: undefined }),
        [{ id: "ja.rawkuma", registryId: "aidoku-community", icon: ICON }],
      ),
    ).toBe(ICON);
  });

  it("accepts a prebuilt index", () => {
    const index = buildMobileSourceIconIndex([
      { id: "ja.rawkuma", registryId: "aidoku-community", icon: ICON },
    ]);
    expect(resolveMobileInstalledSourceIconUri(installed(), index)).toBe(ICON);
  });

  it("returns null when nothing in the chain has an icon", () => {
    expect(resolveMobileInstalledSourceIconUri(installed())).toBeNull();
    expect(resolveMobileInstalledSourceIconUri(installed(), [])).toBeNull();
    expect(
      resolveMobileInstalledSourceIconUri(installed(), [
        { id: "ja.other", registryId: "aidoku-community", icon: ICON },
      ]),
    ).toBeNull();
  });
});
