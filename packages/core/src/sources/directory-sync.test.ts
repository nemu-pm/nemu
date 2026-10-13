import { describe, expect, test } from "bun:test";
import {
  MAX_CLOUD_SOURCE_DIRECTORIES,
  mergeCloudSourceDirectories,
  type CloudSourceDirectory,
} from "./directory-sync";

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
