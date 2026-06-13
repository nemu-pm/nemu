import { describe, expect, it } from "bun:test";
import type { MangaSource } from "@/lib/sources/types";
import * as sourceSettingsAuthModule from "./source-settings-auth";

describe("source login submission", () => {
  it("rejects basic login when the source lacks auth handlers", async () => {
    expect(typeof (sourceSettingsAuthModule as Record<string, unknown>).submitSourceBasicLogin).toBe("function");

    const source: MangaSource = {
      id: "test-source",
      name: "Test Source",
      search: async () => ({ items: [], hasMore: false }),
      getManga: async () => ({ id: "manga", title: "Manga" }),
      getChapters: async () => [],
      getPages: async () => [],
      fetchImage: async () => new Blob(),
      dispose: () => {},
    };

    const submitSourceBasicLogin = (sourceSettingsAuthModule as {
      submitSourceBasicLogin: (
        source: MangaSource | null,
        key: string,
        username: string,
        password: string,
        fallbackMessage: string
      ) => Promise<void>;
    }).submitSourceBasicLogin;

    await expect(
      submitSourceBasicLogin(source, "account", "demo", "secret", "Login failed.")
    ).rejects.toThrow("Login failed.");
  });

  it("rejects web login when the source lacks auth handlers", async () => {
    expect(typeof (sourceSettingsAuthModule as Record<string, unknown>).submitSourceWebLogin).toBe("function");

    const source: MangaSource = {
      id: "test-source",
      name: "Test Source",
      search: async () => ({ items: [], hasMore: false }),
      getManga: async () => ({ id: "manga", title: "Manga" }),
      getChapters: async () => [],
      getPages: async () => [],
      fetchImage: async () => new Blob(),
      dispose: () => {},
    };

    const submitSourceWebLogin = (sourceSettingsAuthModule as {
      submitSourceWebLogin: (
        source: MangaSource | null,
        key: string,
        cookies: Record<string, string>,
        fallbackMessage: string
      ) => Promise<void>;
    }).submitSourceWebLogin;

    await expect(
      submitSourceWebLogin(source, "account", { session: "abc123" }, "Login failed.")
    ).rejects.toThrow("Login failed.");
  });
});
