import { describe, expect, test } from "bun:test";
import type { InstalledSource, LocalSourceSettings, UserSettings } from "@/data/schema";
import { saveSelfHostedSource, selfHostedNeedsSignIn, type SelfHostedStore } from "./store";

function memoryStore(initial: InstalledSource[] = []) {
  const sources = new Map(initial.map((source) => [source.id, source]));
  const settings = new Map<string, LocalSourceSettings>();
  const store: SelfHostedStore = {
    getSyncSettings: async () => ({ installedSources: [...sources.values()] }) as unknown as UserSettings,
    saveInstalledSource: async (source) => void sources.set(source.id, source),
    saveSourceSettings: async (value) => void settings.set(value.sourceKey, value),
    resetSourceSettings: async (key) => void settings.delete(key),
  };
  return { store, sources, settings };
}

const komga = { kind: "komga" as const, name: "Home", server: "http://192.168.1.20:25600", credentials: { username: "a", password: "b" } };

describe("saveSelfHostedSource", () => {
  test("stores the address on the synced row and the login only in source settings", async () => {
    const { store, sources, settings } = memoryStore();
    const saved = await saveSelfHostedSource(store, komga);
    expect(saved.id).toBe("self-hosted:komga.home");
    expect(saved.selfHosted).toEqual({ kind: "komga", server: "http://192.168.1.20:25600" });
    expect(JSON.stringify(sources.get(saved.id))).not.toContain("\"b\"");
    expect(settings.get(saved.id)?.values).toEqual({ username: "a", password: "b" });
  });

  test("gives several servers of one kind several keys", async () => {
    const { store } = memoryStore();
    const first = await saveSelfHostedSource(store, komga);
    const second = await saveSelfHostedSource(store, { ...komga, server: "http://192.168.1.21:25600" });
    expect(first.sourceId).toBe("komga.home");
    expect(second.sourceId).toBe("komga.home-1");
  });

  test("keeps a removed server's key reserved", async () => {
    const { store, sources } = memoryStore();
    const first = await saveSelfHostedSource(store, komga);
    sources.set(first.id, { ...first, removed: true });
    expect((await saveSelfHostedSource(store, komga)).sourceId).toBe("komga.home-1");
  });

  test("editing keeps the key and the disable toggle; a rename changes only the name", async () => {
    const { store, sources } = memoryStore();
    const first = await saveSelfHostedSource(store, komga);
    sources.set(first.id, { ...first, disabled: true });
    const edited = await saveSelfHostedSource(store, {
      ...komga,
      sourceId: first.sourceId,
      name: "Basement",
      server: "http://192.168.1.99:25600",
    });
    expect(edited.id).toBe(first.id);
    expect(edited.name).toBe("Basement");
    expect(edited.selfHosted?.server).toBe("http://192.168.1.99:25600");
    expect(edited.disabled).toBe(true);
    expect(edited.updatedAt).toBeGreaterThan(first.updatedAt ?? 0);
  });

  test("saving without a login clears any stored one", async () => {
    const { store, settings } = memoryStore();
    const first = await saveSelfHostedSource(store, komga);
    await saveSelfHostedSource(store, { ...komga, sourceId: first.sourceId, credentials: {} });
    expect(settings.has(first.id)).toBe(false);
  });
});

describe("selfHostedNeedsSignIn", () => {
  test("a synced server with no login on this device needs signing in", () => {
    const row = { registryId: "self-hosted", hasAuthentication: true };
    expect(selfHostedNeedsSignIn(row, null)).toBe(true);
    expect(selfHostedNeedsSignIn(row, { apiKey: "K" })).toBe(false);
    expect(selfHostedNeedsSignIn({ registryId: "other", hasAuthentication: true }, null)).toBe(false);
    expect(selfHostedNeedsSignIn({ registryId: "self-hosted", hasAuthentication: false }, null)).toBe(false);
  });
});
