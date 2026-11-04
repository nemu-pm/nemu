import { describe, expect, test } from "bun:test";
import type { CloudSourceDirectory } from "@nemu/core/sources";
import type { SourceRegistry, UserSettings } from "@/data/schema";
import type { MobileDataStore } from "@/data/storeTypes";
import { reconcileSourceDirectories } from "@/data/mobileSourceDirectories";
import {
  canonicalCloudSourceDirectories,
  syncMobileSourceDirectories,
} from "./mobileSourceDirectorySync";

const now = Date.now();
const cloudDir = (id: string, over: Partial<CloudSourceDirectory> = {}): CloudSourceDirectory => ({
  id,
  name: id,
  indexUrl: `https://${id}.example.com/index.min.json`,
  enabled: true,
  updatedAt: now,
  ...over,
});
const localDir = (id: string, over: Record<string, unknown> = {}): SourceRegistry =>
  ({
    id,
    name: id,
    type: "url",
    url: `https://${id}.example.com/index.min.json`,
    addedAt: now - 100,
    ...over,
  }) as SourceRegistry;

describe("reconcileSourceDirectories", () => {
  test("a new device restores the directories the account has", () => {
    const plan = reconcileSourceDirectories([], [cloudDir("a"), cloudDir("b", { enabled: false })]);
    expect(plan.save.map((r) => r.id)).toEqual(["a", "b"]);
    expect(plan.save[1]).toMatchObject({ disabled: true, updatedAt: now });
    expect(plan.push).toEqual([]);
  });

  test("local-only and newer local directories are pushed; built-ins never sync", () => {
    const plan = reconcileSourceDirectories(
      [
        localDir("only-here"),
        localDir("both", { updatedAt: now + 5 }),
        localDir("nemu-recommended", { builtIn: true }),
      ],
      [cloudDir("both", { updatedAt: now })],
    );
    expect(plan.push.map((d) => d.id).sort()).toEqual(["both", "only-here"]);
    expect(plan.save).toEqual([]);
  });

  test("a newer cloud tombstone removes the local row, an older one does not", () => {
    const removedNewer = reconcileSourceDirectories([localDir("a", { updatedAt: now - 5 })], [
      cloudDir("a", { removed: true, updatedAt: now }),
    ]);
    expect(removedNewer.removeIds).toEqual(["a"]);
    const removedOlder = reconcileSourceDirectories([localDir("a", { updatedAt: now + 5 })], [
      cloudDir("a", { removed: true, updatedAt: now }),
    ]);
    expect(removedOlder.removeIds).toEqual([]);
    expect(removedOlder.push.map((d) => d.id)).toEqual(["a"]);
  });

  test("a cloud copy never overwrites the built-in recommended directory", () => {
    const plan = reconcileSourceDirectories(
      [localDir("nemu-recommended", { builtIn: true })],
      [cloudDir("nemu-recommended", { name: "evil" })],
    );
    expect(plan.save).toEqual([]);
  });
});

describe("old rows and old clients", () => {
  test("a settings row without the field reads as no directories", () => {
    expect(canonicalCloudSourceDirectories([{}, { sourceDirectories: undefined }])).toEqual([]);
    expect(canonicalCloudSourceDirectories([{ sourceDirectories: [cloudDir("a")] }, {}]).map((d) => d.id)).toEqual(["a"]);
  });

  test("syncing against an old row restores nothing and pushes the local list", async () => {
    const rows = new Map<string, SourceRegistry>([["mine", localDir("mine")]]);
    let settings: UserSettings = { installedSources: [], sourceDirectoriesSeeded: true };
    const store = {
      getRegistries: async () => [...rows.values()],
      getRegistry: async (id: string) => rows.get(id) ?? null,
      saveRegistry: async (r: SourceRegistry) => void rows.set(r.id, r),
      removeRegistry: async (id: string) => void rows.delete(id),
      getSyncSettings: async () => settings,
      getSettings: async () => settings,
      updateSettings: async (fn: (s: UserSettings) => UserSettings) => (settings = fn(settings)),
    } as unknown as MobileDataStore;
    const pushed: unknown[] = [];
    const convex = { mutation: async (_ref: unknown, args: unknown) => void pushed.push(args) } as never;
    const result = await syncMobileSourceDirectories({
      store,
      convex,
      cloud: [],
      generation: 1,
      shouldContinue: () => true,
    });
    expect(result.changed).toBe(false);
    expect([...rows.keys()].sort()).toEqual(["mine", "nemu-recommended"]);
    expect(pushed).toHaveLength(1);
    expect((pushed[0] as { directory: { id: string } }).directory.id).toBe("mine");
  });
});
