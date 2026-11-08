import { describe, expect, test } from "bun:test";
import {
  MAX_CLOUD_SOURCE_DIRECTORIES,
  deriveSourceDirectoryFromInstalledSource,
  mergeCloudSourceDirectories,
  planSourceDirectoryBackfill,
  planSourceDirectoryReconcile,
  sourceDirectoryUrlKey,
  type CloudSourceDirectory,
  type LocalSourceDirectoryRow,
} from "./directory-sync";
import { sourceDirectoryIdForUrl } from "./registries";

const now = Date.now();
const dir = (id: string, over: Partial<CloudSourceDirectory> = {}): CloudSourceDirectory => ({
  id,
  name: id,
  indexUrl: `https://${id}.example.com/index.min.json`,
  enabled: true,
  updatedAt: now,
  ...over,
});

describe("mergeCloudSourceDirectories", () => {
  test("a row written before the field existed merges as empty", () => {
    const merged = mergeCloudSourceDirectories([], [dir("a")]);
    expect(merged.accepted).toBe(true);
    expect(merged.records.map((r) => r.id)).toEqual(["a"]);
  });

  test("newer wins, older is ignored", () => {
    const base = [dir("a", { updatedAt: now - 10, name: "old" })];
    expect(
      mergeCloudSourceDirectories(base, [dir("a", { updatedAt: now - 5, name: "new" })]).records[0]!.name,
    ).toBe("new");
    const stale = mergeCloudSourceDirectories(base, [dir("a", { updatedAt: now - 20, name: "stale" })]);
    expect(stale.accepted).toBe(false);
    expect(stale.records[0]!.name).toBe("old");
  });

  test("a tombstone beats an older live record and a later add revives it", () => {
    const live = [dir("a", { updatedAt: now - 10 })];
    const removed = mergeCloudSourceDirectories(live, [dir("a", { updatedAt: now - 5, removed: true })]);
    expect(removed.records[0]).toMatchObject({ id: "a", removed: true, indexUrl: "" });
    const revived = mergeCloudSourceDirectories(removed.records, [dir("a", { updatedAt: now - 1 })]);
    expect(revived.records[0]!.removed).toBeUndefined();
  });

  test("rejects non-https, local and malformed directories without throwing", () => {
    for (const indexUrl of ["http://x.example.com/index.json", "https://192.168.1.2/index.json", "nope", "https://x.example.com/"]) {
      const merged = mergeCloudSourceDirectories([], [dir("bad", { indexUrl })]);
      expect(merged.records).toEqual([]);
      expect(merged.accepted).toBe(false);
    }
  });

  test("caps live directories", () => {
    const many = Array.from({ length: MAX_CLOUD_SOURCE_DIRECTORIES + 5 }, (_, i) => dir(`d${i}`));
    const merged = mergeCloudSourceDirectories([], many);
    expect(merged.records.length).toBe(MAX_CLOUD_SOURCE_DIRECTORIES);
  });
});

const row = (id: string, over: Partial<LocalSourceDirectoryRow> = {}): LocalSourceDirectoryRow => ({
  id,
  name: id,
  indexUrl: `https://${id}.example.com/index.min.json`,
  enabled: true,
  addedAt: now - 100,
  ...over,
});

describe("planSourceDirectoryReconcile", () => {
  test("the same URL under two ids is one directory: no duplicate row, pushes go to the cloud id", () => {
    const url = "https://shared.example.com/index.min.json";
    const same = planSourceDirectoryReconcile(
      [row("web-id", { indexUrl: url, updatedAt: now - 50 })],
      [dir("cloud-id", { indexUrl: url, updatedAt: now - 50 })],
    );
    expect(same).toEqual({ save: [], removeIds: [], push: [] });

    const localNewer = planSourceDirectoryReconcile(
      [row("web-id", { indexUrl: url, enabled: false, updatedAt: now })],
      [dir("cloud-id", { indexUrl: url, updatedAt: now - 50 })],
    );
    expect(localNewer.save).toEqual([]);
    expect(localNewer.push).toEqual([
      expect.objectContaining({ id: "cloud-id", enabled: false, updatedAt: now }),
    ]);

    const cloudNewer = planSourceDirectoryReconcile(
      [row("web-id", { indexUrl: url, updatedAt: now - 50 })],
      [dir("cloud-id", { indexUrl: url, name: "Renamed", updatedAt: now })],
    );
    expect(cloudNewer.save).toEqual([
      { localId: "web-id", remote: expect.objectContaining({ id: "cloud-id", name: "Renamed" }) },
    ]);
    expect(cloudNewer.push).toEqual([]);
  });

  test("URL matching ignores a missing index file name and host case", () => {
    expect(sourceDirectoryUrlKey("https://Example.com/repo")).toBe(
      sourceDirectoryUrlKey("https://example.com/repo/index.min.json"),
    );
    const plan = planSourceDirectoryReconcile(
      [row("a", { indexUrl: "https://Example.com/repo/index.min.json" })],
      [dir("b", { indexUrl: "https://example.com/repo/index.min.json", updatedAt: now - 100 })],
    );
    expect(plan).toEqual({ save: [], removeIds: [], push: [] });
  });

  test("existing local directories upload on first sync; cloud-only ones are added", () => {
    const plan = planSourceDirectoryReconcile([row("mine")], [dir("theirs")]);
    expect(plan.push.map((d) => d.id)).toEqual(["mine"]);
    expect(plan.save).toEqual([{ localId: "theirs", remote: expect.objectContaining({ id: "theirs" }) }]);
  });

  test("a built-in row absorbs a cloud copy of itself (by id or URL) and never pushes", () => {
    const builtIn = row("nemu-recommended", { builtIn: true, indexUrl: "https://nemu.example.com/index.min.json" });
    const plan = planSourceDirectoryReconcile([builtIn], [
      dir("nemu-recommended", { name: "evil", updatedAt: now + 5 }),
      dir("dir-copy", { indexUrl: "https://nemu.example.com/index.min.json" }),
    ]);
    expect(plan).toEqual({ save: [], removeIds: [], push: [] });
  });

  test("tombstones: newer cloud removal removes; a newer local removal is pushed as a tombstone", () => {
    expect(
      planSourceDirectoryReconcile([row("a", { updatedAt: now - 5 })], [dir("a", { removed: true, updatedAt: now })]).removeIds,
    ).toEqual(["a"]);
    const localRemoval = planSourceDirectoryReconcile(
      [row("a", { removed: true, updatedAt: now })],
      [dir("a", { updatedAt: now - 5 })],
    );
    expect(localRemoval.save).toEqual([]);
    expect(localRemoval.push).toEqual([expect.objectContaining({ id: "a", removed: true, indexUrl: "" })]);
    // A cloud record matched to a removed local row by URL is not re-added.
    const byUrl = planSourceDirectoryReconcile(
      [row("x", { removed: true, updatedAt: now, indexUrl: "https://s.example.com/index.min.json" })],
      [dir("y", { indexUrl: "https://s.example.com/index.min.json", updatedAt: now - 5 })],
    );
    expect(byUrl.save).toEqual([]);
    expect(byUrl.push).toEqual([expect.objectContaining({ id: "y", removed: true })]);
  });

  test("a live URL match wins over an older tombstone under the local id", () => {
    const url = "https://s.example.com/index.min.json";
    const plan = planSourceDirectoryReconcile(
      [row("a", { indexUrl: url, updatedAt: now - 50 })],
      [dir("a", { removed: true, updatedAt: now - 60 }), dir("b", { indexUrl: url, updatedAt: now - 50 })],
    );
    expect(plan).toEqual({ save: [], removeIds: [], push: [] });
  });
});

describe("deriveSourceDirectoryFromInstalledSource", () => {
  test("shipped and legacy directories resolve by id", () => {
    expect(deriveSourceDirectoryFromInstalledSource({ registryId: "nemu-recommended" })?.indexUrl).toBe(
      "https://nemu-pm.github.io/source-registry/index.min.json",
    );
    expect(deriveSourceDirectoryFromInstalledSource({ id: "aidoku-zh:zh.manhuaren" })?.id).toBe("aidoku-zh");
  });

  test("a user directory is recovered when its URL reproduces the id", () => {
    const indexUrl = "https://someone.github.io/sources/index.min.json";
    const id = sourceDirectoryIdForUrl(indexUrl);
    expect(
      deriveSourceDirectoryFromInstalledSource({
        registryId: id,
        downloadUrl: "https://someone.github.io/sources/sources/en.example-v3.aix",
      }),
    ).toEqual({ id, name: "someone/sources", indexUrl });
    const jsonId = sourceDirectoryIdForUrl("https://x.example.com/repo/index.json");
    expect(
      deriveSourceDirectoryFromInstalledSource({
        registryId: jsonId,
        downloadUrl: "https://x.example.com/repo/packages/a/b.aix?x=1",
      })?.indexUrl,
    ).toBe("https://x.example.com/repo/index.json");
  });

  test("never guesses", () => {
    expect(
      deriveSourceDirectoryFromInstalledSource({
        registryId: "dir-000000000000",
        downloadUrl: "https://someone.github.io/sources/sources/en.example-v3.aix",
      }),
    ).toBeNull();
    expect(deriveSourceDirectoryFromInstalledSource({ registryId: "dir-1" })).toBeNull();
    expect(deriveSourceDirectoryFromInstalledSource({})).toBeNull();
  });
});

describe("planSourceDirectoryBackfill", () => {
  const indexUrl = "https://someone.github.io/sources/index.min.json";
  const id = sourceDirectoryIdForUrl(indexUrl);
  const source = { id: `${id}:en.a`, registryId: id, downloadUrl: "https://someone.github.io/sources/sources/en.a-v1.aix" };

  test("recovers missing directories once, legacy ones included", () => {
    const plan = planSourceDirectoryBackfill({
      installedSources: [source, { ...source, id: `${id}:en.b` }, { id: "aidoku-community:multi.mangadex", registryId: "aidoku-community" }],
      local: [],
      cloud: [],
    });
    expect(plan.map((d) => d.id)).toEqual([id, "aidoku-community"]);
  });

  test("skips present, removed-on-account, cloud-live, tachiyomi and removed sources", () => {
    const base = { installedSources: [source], local: [], cloud: [] };
    expect(planSourceDirectoryBackfill({ ...base, local: [{ id, indexUrl }] })).toEqual([]);
    expect(planSourceDirectoryBackfill({ ...base, cloud: [dir(id, { removed: true })] })).toEqual([]);
    expect(planSourceDirectoryBackfill({ ...base, cloud: [dir(id, { indexUrl })] })).toEqual([]);
    expect(planSourceDirectoryBackfill({ ...base, installedSources: [{ ...source, sourceKind: "tachiyomi" }] })).toEqual([]);
    expect(planSourceDirectoryBackfill({ ...base, installedSources: [{ ...source, removed: true }] })).toEqual([]);
    // Same URL already present under another id: no second row.
    expect(planSourceDirectoryBackfill({ ...base, local: [{ id: "other", indexUrl }] })).toEqual([]);
  });
});
