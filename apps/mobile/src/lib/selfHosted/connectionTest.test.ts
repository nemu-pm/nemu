import { describe, expect, test } from "bun:test";
import { testSelfHostedConnection } from "./connectionTest";
import { SelfHostedError } from "./http";
import type { SelfHostedTransport } from "./http";

const config = { kind: "komga" as const, server: "http://192.168.1.20:25600" };

function deps(transport: SelfHostedTransport, timeoutMs = 1_000) {
  const grants: Array<[string, string[]]> = [];
  return {
    grants,
    value: {
      setGrant: (scope: string, urls: string[]) => void grants.push([scope, urls]),
      transportFor: () => transport,
      language: "en" as const,
      timeoutMs,
      scopeId: "t",
    },
  };
}

describe("testSelfHostedConnection", () => {
  test("grants exactly the typed address for a throwaway scope and revokes it afterwards", async () => {
    const { grants, value } = deps(async () => ({ status: 200, headers: {}, body: '{"roles":["USER"]}' }));
    await testSelfHostedConnection({ config, credentials: { apiKey: "K" } }, value);
    expect(grants).toHaveLength(2);
    expect(grants[0]![1]).toEqual(["http://192.168.1.20:25600"]);
    expect(grants[0]![0]).toContain("self-hosted:setup-t");
    expect(grants[1]).toEqual([grants[0]![0], []]);
  });

  test("revokes the grant when the login is rejected, and says why", async () => {
    const { grants, value } = deps(async () => ({ status: 401, headers: {}, body: "{}" }));
    await expect(testSelfHostedConnection({ config, credentials: {} }, value)).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(grants.at(-1)![1]).toEqual([]);
  });

  test("times out instead of hanging on a server that never answers", async () => {
    const { grants, value } = deps(() => new Promise(() => {}), 20);
    const error = await testSelfHostedConnection({ config, credentials: {} }, value).catch((e) => e);
    expect(error).toBeInstanceOf(SelfHostedError);
    expect(error.code).toBe("unreachable");
    expect(grants.at(-1)![1]).toEqual([]);
  });
});
