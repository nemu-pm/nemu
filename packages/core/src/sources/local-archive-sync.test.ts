import { describe, expect, test } from "bun:test";
import { mergeCloudLocalArchiveVolumes, type CloudLocalArchiveVolume } from "./local-archive-sync";

const now = Date.now();
const hash = "ab".repeat(32);
const vol = (n: string, over: Partial<CloudLocalArchiveVolume> = {}): CloudLocalArchiveVolume => ({
  volumeId: `v-${n.repeat(32)}`,
  workId: "w1",
  title: "Vol",
  contentHash: hash,
  pageCount: 10,
  importedAt: now,
  updatedAt: now,
  ...over,
});

describe("mergeCloudLocalArchiveVolumes", () => {
  test("a row from before the field existed merges as empty", () => {
    const merged = mergeCloudLocalArchiveVolumes([], [vol("a")]);
    expect(merged.accepted).toBe(true);
    expect(merged.records).toHaveLength(1);
  });
  test("newer wins, tombstones win over older live rows, bad ids are dropped", () => {
    const base = [vol("a", { updatedAt: now - 10, title: "old" })];
    expect(mergeCloudLocalArchiveVolumes(base, [vol("a", { updatedAt: now - 5, title: "new" })]).records[0]!.title).toBe("new");
    expect(mergeCloudLocalArchiveVolumes(base, [vol("a", { updatedAt: now - 20 })]).accepted).toBe(false);
    const gone = mergeCloudLocalArchiveVolumes(base, [vol("a", { updatedAt: now - 1, removed: true })]);
    expect(gone.records[0]).toMatchObject({ removed: true, title: "" });
    expect(mergeCloudLocalArchiveVolumes([], [{ ...vol("a"), volumeId: "bad" }]).records).toEqual([]);
    expect(mergeCloudLocalArchiveVolumes([], [vol("a", { contentHash: "x" })]).records).toEqual([]);
  });
});
