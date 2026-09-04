import { describe, expect, test } from "bun:test";
import { didMobileInstalledSourcesApplyChange } from "./mobileInstalledSourcesApply";

const source = (
  overrides: Partial<{ id: string; updatedAt: number }> & {
    [field: string]: unknown;
  } = {},
) => ({
  id: "aidoku:mangadex",
  registryId: "registry",
  version: 1,
  updatedAt: 100,
  removed: false,
  ...overrides,
});

describe("didMobileInstalledSourcesApplyChange", () => {
  test("an empty snapshot never counts as a change", () => {
    expect(didMobileInstalledSourcesApplyChange([source()], [])).toBe(false);
  });

  test("an identical snapshot never counts as a change", () => {
    expect(
      didMobileInstalledSourcesApplyChange([source()], [source()]),
    ).toBe(false);
  });

  test("a new source is a change", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [],
        [source({ id: "aidoku:comick" })],
      ),
    ).toBe(true);
  });

  test("a newer cloud row for an existing source is a change", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [source()],
        [source({ updatedAt: 200, version: 2 })],
      ),
    ).toBe(true);
  });

  test("a strictly newer local row is skipped by the store, so not a change", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [source({ updatedAt: 500, version: 7 })],
        [source({ updatedAt: 100, version: 1 })],
      ),
    ).toBe(false);
  });

  test("an equal-timestamp row with different content is a change", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [source()],
        [source({ removed: true })],
      ),
    ).toBe(true);
  });

  test("structured fields compare by value, not identity", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [source({ languages: ["en"], packageMetadata: { a: 1 } })],
        [source({ languages: ["en"], packageMetadata: { a: 1 } })],
      ),
    ).toBe(false);
    expect(
      didMobileInstalledSourcesApplyChange(
        [source({ languages: ["en"] })],
        [source({ languages: ["en", "ja"] })],
      ),
    ).toBe(true);
  });

  test("a field present on only one side is a change", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [source()],
        [source({ packageUri: "file:///cached.aix" })],
      ),
    ).toBe(true);
  });

  test("key order does not affect the comparison", () => {
    expect(
      didMobileInstalledSourcesApplyChange(
        [{ id: "a", version: 1, updatedAt: 10 }],
        [{ updatedAt: 10, id: "a", version: 1 }],
      ),
    ).toBe(false);
  });
});
