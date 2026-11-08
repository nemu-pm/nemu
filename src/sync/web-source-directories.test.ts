import { describe, expect, test } from "bun:test";
import {
  NEMU_RECOMMENDED_REGISTRY,
  sourceDirectoryIdForUrl,
  type CloudSourceDirectory,
} from "@nemu/core/sources";
import type { InstalledSource, SourceRegistry } from "@/data/schema";
import {
  canonicalCloudSourceDirectories,
  planWebSourceDirectorySync,
  syncWebSourceDirectories,
} from "./web-source-directories";

const now = 1_790_000_000_000;
const cloudDir = (
  id: string,
  over: Partial<CloudSourceDirectory> = {},
): CloudSourceDirectory => ({
  id,
  name: id,
  indexUrl: `https://${id}.example.com/index.min.json`,
  enabled: true,
  updatedAt: now,
  ...over,
});
const webDir = (
  id: string,
  over: Partial<Extract<SourceRegistry, { type: "url" }>> = {},
): SourceRegistry => ({
  id,
  name: id,
  type: "url",
  url: `https://${id}.example.com/index.min.json`,
  ...over,
});
const plan = (
  registries: SourceRegistry[],
  cloud: CloudSourceDirectory[],
  installedSources: InstalledSource[] = [],
) => planWebSourceDirectorySync({ registries, cloud, installedSources, now });

describe("planWebSourceDirectorySync", () => {
  test("existing web directories (no clock yet) upload on first sync", () => {
    const result = plan([webDir("mine")], []);
    expect(result.save).toEqual([]);
    expect(result.push).toEqual([
      expect.objectContaining({ id: "mine", updatedAt: 0, enabled: true }),
    ]);
  });

  test("a directory added on mobile appears; disabled stays disabled", () => {
    const result = plan([], [cloudDir("a"), cloudDir("b", { enabled: false })]);
    expect(result.save).toEqual([
      expect.objectContaining({ id: "a", type: "url", updatedAt: now }),
      expect.objectContaining({ id: "b", disabled: true }),
    ]);
    expect(result.push).toEqual([]);
  });

  test("the same URL added on both sides stays one directory", () => {
    const url = "https://shared.example.com/index.min.json";
    const result = plan(
      [webDir("web-id", { url, updatedAt: now - 10 })],
      [cloudDir(sourceDirectoryIdForUrl(url), { indexUrl: url, name: "Shared", updatedAt: now })],
    );
    expect(result.save).toEqual([
      expect.objectContaining({ id: "web-id", name: "Shared", url }),
    ]);
    expect(result.push).toEqual([]);
  });

  test("built-ins line up with mobile: no duplicate rows, never pushed", () => {
    // Mobile syncs the legacy Aidoku directories as user directories with the
    // same ids, and never syncs nemu recommended; either way nothing is added.
    const result = plan([], [
      cloudDir("aidoku-community", {
        indexUrl: "https://aidoku-community.github.io/sources/index.min.json",
      }),
      cloudDir("dir-x", { indexUrl: NEMU_RECOMMENDED_REGISTRY.indexUrl }),
    ]);
    expect(result).toEqual({ save: [], push: [] });
  });

  test("a removal on mobile leaves a tombstone here; a local removal is pushed", () => {
    const removedRemotely = plan(
      [webDir("a", { updatedAt: now - 10 })],
      [cloudDir("a", { removed: true, indexUrl: "", name: "" })],
    );
    expect(removedRemotely.save).toEqual([
      expect.objectContaining({ id: "a", removed: true, url: "https://a.example.com/index.min.json" }),
    ]);
    // The tombstone is stable on the next pass.
    expect(plan(removedRemotely.save, [cloudDir("a", { removed: true, indexUrl: "", name: "" })])).toEqual({
      save: [],
      push: [],
    });

    const removedHere = plan(
      [webDir("a", { removed: true, updatedAt: now + 5 })],
      [cloudDir("a")],
    );
    expect(removedHere.save).toEqual([]);
    expect(removedHere.push).toEqual([
      expect.objectContaining({ id: "a", removed: true }),
    ]);
  });

  test("backfills the directory of a source installed on mobile from a directory this browser lacks", () => {
    const indexUrl = "https://someone.github.io/sources/index.min.json";
    const id = sourceDirectoryIdForUrl(indexUrl);
    const source = {
      id: `${id}:en.a`,
      registryId: id,
      sourceId: "en.a",
      version: 1,
      downloadUrl: "https://someone.github.io/sources/sources/en.a-v1.aix",
    } as InstalledSource;
    const result = plan([], [], [source]);
    expect(result.save).toEqual([
      expect.objectContaining({ id, url: indexUrl, name: "someone/sources", updatedAt: now }),
    ]);
    expect(result.push).toEqual([expect.objectContaining({ id, indexUrl })]);
    // Built-in ids need no row.
    expect(
      plan([], [], [{ ...source, id: "nemu-recommended:multi.peppercarrot", registryId: "nemu-recommended" }]),
    ).toEqual({ save: [], push: [] });
  });
});

describe("syncWebSourceDirectories", () => {
  test("writes, pushes, and survives a push failure", async () => {
    const rows = new Map<string, SourceRegistry>([["mine", webDir("mine")]]);
    const localStore = {
      getRegistries: async () => [...rows.values()],
      saveRegistry: async (row: SourceRegistry) => void rows.set(row.id, row),
    };
    const pushed: unknown[] = [];
    let calls = 0;
    const convex = {
      mutation: async (_ref: unknown, args: unknown) => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        pushed.push(args);
      },
    } as never;
    const result = await syncWebSourceDirectories({
      localStore,
      convex,
      cloud: [cloudDir("theirs")],
      installedSources: [],
      generation: 3,
      expectedUserId: "u",
      shouldContinue: () => true,
    });
    expect(result.changed).toBe(true);
    expect([...rows.keys()].sort()).toEqual(["mine", "theirs"]);
    expect(calls).toBe(1);
    expect(pushed).toEqual([]);
  });

  test("old settings rows without the field read as no directories", () => {
    expect(canonicalCloudSourceDirectories([{}, { sourceDirectories: [cloudDir("a")] }]).map((d) => d.id)).toEqual(["a"]);
  });
});
