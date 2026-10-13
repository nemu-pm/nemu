import { beforeEach, describe, expect, test } from "bun:test";
import type { InstalledSource, LocalSourceSettings } from "@/data/schema";
import {
  MOBILE_LOCAL_NETWORK_SERVER_SETTINGS,
  applyMobileLocalNetworkAllowances,
  collectMobileLocalNetworkUrls,
  resetMobileLocalNetworkAllowanceStateForTests,
  resolveMobileLocalNetworkAllowanceTargets,
} from "./mobileLocalNetworkAllowance";

function installed(
  registryId: string,
  sourceId: string,
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id: `${registryId}:${sourceId}`,
    registryId,
    sourceId,
    sourceKind: "aidoku",
    version: 1,
    ...overrides,
  };
}

function storeWith(settings: Record<string, Record<string, unknown>>) {
  return {
    async getSourceSettings(key: string): Promise<LocalSourceSettings | null> {
      const values = settings[key];
      return values ? { sourceKey: key, values, updatedAt: 1 } : null;
    },
  };
}

beforeEach(() => resetMobileLocalNetworkAllowanceStateForTests());

describe("collectMobileLocalNetworkUrls", () => {
  test("reads only the declared server-URL setting of a self-hosted source", () => {
    expect(
      collectMobileLocalNetworkUrls("multi.lanraragi", {
        baseUrl: " http://192.168.1.20:3000 ",
        apiKey: "http://10.0.0.9",
        other: "http://10.0.0.8",
      }),
    ).toEqual(["http://192.168.1.20:3000"]);
  });

  test("ignores other sources, non-http values and absent settings", () => {
    expect(
      collectMobileLocalNetworkUrls("en.mangadex", { baseUrl: "http://10.0.0.1" }),
    ).toEqual([]);
    expect(
      collectMobileLocalNetworkUrls("multi.lanraragi", { baseUrl: "file:///etc" }),
    ).toEqual([]);
    expect(
      collectMobileLocalNetworkUrls("multi.lanraragi", { baseUrl: 12 }),
    ).toEqual([]);
    expect(collectMobileLocalNetworkUrls("multi.lanraragi", null)).toEqual([]);
    expect(
      collectMobileLocalNetworkUrls("constructor", { baseUrl: "http://10.0.0.1" }),
    ).toEqual([]);
  });

  test("the table names LANraragi's baseUrl and nothing broader", () => {
    expect(MOBILE_LOCAL_NETWORK_SERVER_SETTINGS).toEqual({
      "multi.lanraragi": ["baseUrl"],
    });
  });
});

describe("resolveMobileLocalNetworkAllowanceTargets", () => {
  const settings = {
    "aidoku-community:multi.lanraragi": { baseUrl: "http://192.168.1.20:3000" },
    "nemu-recommended:en.other": { baseUrl: "http://192.168.1.99" },
  };

  test("scopes the grant to the source's profile-scoped execution key", async () => {
    const targets = await resolveMobileLocalNetworkAllowanceTargets(
      storeWith(settings),
      [
        installed("aidoku-community", "multi.lanraragi"),
        installed("nemu-recommended", "en.other"),
      ],
      "local",
    );
    expect(targets).toEqual([
      {
        scopeKey: "local::aidoku-community:multi.lanraragi",
        urls: ["http://192.168.1.20:3000"],
      },
    ]);
  });

  test("a package-declared default is never a grant: only saved user values count", async () => {
    // Defaults live in the package schema, not in the saved user settings.
    expect(
      await resolveMobileLocalNetworkAllowanceTargets(
        storeWith({}),
        [installed("aidoku-community", "multi.lanraragi")],
        "local",
      ),
    ).toEqual([]);
  });

  test("a disabled, removed or Tachiyomi install gets no grant", async () => {
    const targets = await resolveMobileLocalNetworkAllowanceTargets(
      storeWith(settings),
      [
        installed("aidoku-community", "multi.lanraragi", { disabled: true }),
        installed("aidoku-community", "multi.lanraragi", { removed: true }),
        installed("aidoku-community", "multi.lanraragi", { sourceKind: "tachiyomi" }),
      ],
      "local",
    );
    expect(targets).toEqual([]);
  });

  test("an imported .aix with the same id is its own scope", async () => {
    const targets = await resolveMobileLocalNetworkAllowanceTargets(
      storeWith({
        "custom-aidoku:multi.lanraragi": { baseUrl: "http://nas.local:3000" },
      }),
      [installed("custom-aidoku", "multi.lanraragi")],
      "local",
    );
    expect(targets.map((target) => target.scopeKey)).toEqual([
      "local::custom-aidoku:multi.lanraragi",
    ]);
  });
});

describe("applyMobileLocalNetworkAllowances", () => {
  test("grants present endpoints and revokes ones that disappeared", () => {
    const calls: Array<[string, string[]]> = [];
    const native = {
      setLocalNetworkAllowance: (key: string, urls: string[]) => {
        calls.push([key, urls]);
        return urls;
      },
    };
    applyMobileLocalNetworkAllowances(native, [
      { scopeKey: "local::a:multi.lanraragi", urls: ["http://10.0.0.5:3000"] },
    ]);
    expect(calls).toEqual([
      ["local::a:multi.lanraragi", ["http://10.0.0.5:3000"]],
    ]);

    calls.length = 0;
    applyMobileLocalNetworkAllowances(native, []);
    expect(calls).toEqual([["local::a:multi.lanraragi", []]]);

    calls.length = 0;
    applyMobileLocalNetworkAllowances(native, []);
    expect(calls).toEqual([]);
  });

  test("is a no-op on a native build without the allowance", () => {
    expect(() =>
      applyMobileLocalNetworkAllowances({}, [
        { scopeKey: "local::a:multi.lanraragi", urls: ["http://10.0.0.5"] },
      ]),
    ).not.toThrow();
  });
});
