import { beforeAll, describe, expect, test } from "bun:test";
import schema from "../convex/schema";
import {
  BETTER_AUTH_SPECIAL_TABLES,
  BETTER_AUTH_USER_TABLES,
  NON_USER_BETTER_AUTH_TABLES,
  NON_USER_OWNED_TABLES,
  r2KeyFromUrl,
  r2KeysOfLibraryItem,
  USER_OWNED_TABLES,
} from "../convex/accountDeletionPlan";
import {
  ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED,
  ACCOUNT_DELETION_APPLE_REVOKE_FAILED,
  ACCOUNT_DELETION_APPLE_UNAVAILABLE,
  runAccountDeletion,
  type AccountDeletionDeps,
} from "../convex/accountDeletionRun";
import {
  appleClientForAudience,
  audienceOfIdToken,
  exchangeAppleAuthorizationCode,
  revokeAppleAccount,
  revokeAppleTokens,
  type AppleEnv,
} from "../convex/appleRevoke";
import { claimR2Upload } from "../convex/r2Ownership";
// The component's own table list: a Better Auth upgrade that adds a table
// makes the coverage test below fail until deletion handles it.
import { tables as betterAuthTables } from "../node_modules/@convex-dev/better-auth/dist/component/schema.js";

type Row = Record<string, unknown> & { _id: string };

/** Runs a registered Convex function's handler directly against a fake ctx. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(fn: unknown, ctx: unknown, args: unknown): Promise<any> {
  return (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })
    ._handler(ctx, args);
}

type IndexBuilder = { eq(field: string, value: unknown): IndexBuilder };

/** Minimal in-memory db supporting the by_user/by_key queries used here. */
function makeDb(initial: Record<string, Row[]>) {
  const data: Record<string, Row[]> = JSON.parse(JSON.stringify(initial));
  let counter = 0;
  const query = (table: string) => ({
    withIndex: (_index: string, build: (q: IndexBuilder) => unknown) => {
      const filters: Array<[string, unknown]> = [];
      const q: IndexBuilder = {
        eq(field: string, value: unknown) {
          filters.push([field, value]);
          return q;
        },
      };
      build(q);
      const matches = () =>
        (data[table] ?? []).filter((row) =>
          filters.every(([field, value]) => row[field] === value),
        );
      return {
        take: async (n: number) => matches().slice(0, n),
        first: async () => matches()[0] ?? null,
        paginate: async ({
          numItems,
          cursor,
        }: {
          numItems: number;
          cursor: string | null;
        }) => {
          const all = matches();
          const start = cursor ? Number(cursor) : 0;
          const page = all.slice(start, start + numItems);
          const end = start + page.length;
          return {
            page,
            isDone: end >= all.length,
            continueCursor: String(end),
          };
        },
      };
    },
  });
  return {
    data,
    db: {
      query,
      insert: async (table: string, doc: Record<string, unknown>) => {
        const _id = `${table}:${++counter}`;
        (data[table] ??= []).push({ ...doc, _id } as Row);
        return _id;
      },
      delete: async (id: string) => {
        for (const table of Object.keys(data)) {
          data[table] = data[table]!.filter((row) => row._id !== id);
        }
      },
    },
  };
}

const identity = (subject: string | null) => ({
  getUserIdentity: async () => (subject ? { subject } : null),
});

describe("account deletion coverage", () => {
  test("every schema table is handled by deletion or explicitly exempt", () => {
    const schemaTables = Object.keys(schema.tables).sort();
    const handled = [
      ...USER_OWNED_TABLES,
      ...Object.keys(NON_USER_OWNED_TABLES),
    ].sort();
    expect(handled).toEqual(schemaTables);
  });

  test("every user-owned table has a userId field and a by_user index", () => {
    for (const table of USER_OWNED_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const definition = (schema.tables as unknown as Record<string, any>)[table];
      const indexes = definition[" indexes"]() as Array<{
        indexDescriptor: string;
        fields: string[];
      }>;
      expect(
        indexes.some(
          (index) =>
            index.indexDescriptor === "by_user" &&
            index.fields.length === 1 &&
            index.fields[0] === "userId",
        ),
      ).toBe(true);
      expect(Object.keys(definition.validator.fields)).toContain("userId");
    }
  });

  test("every Better Auth component table is handled or explicitly exempt", () => {
    const handled = [
      ...Object.keys(BETTER_AUTH_USER_TABLES),
      ...BETTER_AUTH_SPECIAL_TABLES,
      ...Object.keys(NON_USER_BETTER_AUTH_TABLES),
    ].sort();
    expect(handled).toEqual(Object.keys(betterAuthTables).sort());
  });
});

describe("runAccountDeletion", () => {
  function setup(overrides: Partial<AccountDeletionDeps> = {}) {
    const calls: string[] = [];
    const owned: Record<string, number> = Object.fromEntries(
      USER_OWNED_TABLES.map((table) => [table, 250]),
    );
    const authRows: Record<string, number> = {
      session: 2,
      account: 1,
      twoFactor: 0,
      oauthApplication: 0,
      oauthAccessToken: 0,
      oauthConsent: 0,
      verification: 1,
    };
    let userExists = true;
    const r2Pages: Record<string, string[][]> = {
      r2_uploads: [["up-1", "shared"], ["up-2"]],
      library_items: [["cover-1", "shared"]],
    };
    const deleted: string[] = [];
    const deps: AccountDeletionDeps = {
      appleTokens: async () => [{ refreshToken: "refresh" }],
      revokeApple: async () => {
        calls.push("apple");
        return "revoked";
      },
      r2KeysPage: async (_user, source, cursor) => {
        const pages = r2Pages[source]!;
        const index = cursor === null ? 0 : Number(cursor);
        const keys = pages[index] ?? [];
        return {
          keys,
          cursor: index + 1 < pages.length ? String(index + 1) : null,
        };
      },
      deleteR2Object: async (key) => {
        calls.push("r2");
        deleted.push(key);
      },
      purgePage: async (_user, table) => {
        calls.push(`purge:${table}`);
        const count = Math.min(100, owned[table]!);
        owned[table]! -= count;
        return { deleted: count, done: count < 100 };
      },
      userEmail: async () => "person@example.com",
      deleteAuthRows: async (model) => {
        calls.push(`auth:${model}`);
        authRows[model] = 0;
      },
      deleteAuthUser: async () => {
        calls.push("auth:user");
        userExists = false;
      },
      ...overrides,
    };
    return { deps, calls, owned, authRows, deleted, userExists: () => userExists };
  }

  test("removes every user-owned table, auth row, and R2 object", async () => {
    const t = setup();
    const result = await runAccountDeletion(t.deps, "u1");
    expect(Object.values(t.owned).every((count) => count === 0)).toBe(true);
    expect(Object.values(t.authRows).every((count) => count === 0)).toBe(true);
    expect(t.userExists()).toBe(false);
    expect(t.deleted.sort()).toEqual(["cover-1", "shared", "up-1", "up-2"]);
    expect(result).toEqual({ appleRevoke: "revoked", r2ObjectsDeleted: 4 });
    for (const table of USER_OWNED_TABLES) {
      expect(t.calls).toContain(`purge:${table}`);
    }
    for (const model of Object.keys(BETTER_AUTH_USER_TABLES)) {
      expect(t.calls).toContain(`auth:${model}`);
    }
  });

  test("revokes Apple before deleting anything, sessions before the user", async () => {
    const t = setup();
    await runAccountDeletion(t.deps, "u1");
    expect(t.calls[0]).toBe("apple");
    expect(t.calls.indexOf("auth:session")).toBeLessThan(
      t.calls.indexOf("auth:user"),
    );
    expect(t.calls.indexOf("r2")).toBeLessThan(t.calls.indexOf("purge:library_items"));
    expect(t.calls.indexOf("purge:library_items")).toBeLessThan(
      t.calls.indexOf("auth:session"),
    );
  });

  test("an unreachable Apple aborts before any deletion so it can be retried", async () => {
    const t = setup({ revokeApple: async () => "unavailable" });
    await expect(runAccountDeletion(t.deps, "u1")).rejects.toThrow(
      ACCOUNT_DELETION_APPLE_UNAVAILABLE,
    );
    expect(t.calls).toEqual([]);
    expect(t.userExists()).toBe(true);
  });

  test("an Apple rejection never passes silently", async () => {
    for (const outcome of ["rejected", "not-configured"] as const) {
      const t = setup({ revokeApple: async () => outcome });
      await expect(runAccountDeletion(t.deps, "u1")).rejects.toThrow(
        ACCOUNT_DELETION_APPLE_REVOKE_FAILED,
      );
      expect(t.calls).toEqual([]);
      expect(t.userExists()).toBe(true);
    }
  });

  test("invalid_client asks for re-authentication, and fails if a code did not help", async () => {
    const t = setup({ revokeApple: async () => "invalid-client" });
    await expect(runAccountDeletion(t.deps, "u1")).rejects.toThrow(
      ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED,
    );
    await expect(
      runAccountDeletion(t.deps, "u1", { appleAuthorizationCode: "c" }),
    ).rejects.toThrow(ACCOUNT_DELETION_APPLE_REVOKE_FAILED);
    expect(t.userExists()).toBe(true);
  });

  test("an Apple account with no usable token asks for re-authentication", async () => {
    const t = setup({ revokeApple: async () => "no-token" });
    await expect(runAccountDeletion(t.deps, "u1")).rejects.toThrow(
      ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED,
    );
    expect(t.calls).toEqual([]);
  });

  test("invalid_grant means already revoked and deletion proceeds", async () => {
    const t = setup({ revokeApple: async () => "already-revoked" });
    const result = await runAccountDeletion(t.deps, "u1");
    expect(result.appleRevoke).toBe("already-revoked");
    expect(t.userExists()).toBe(false);
  });

  test("the authorization code is passed to the revoke step", async () => {
    let seen: string | undefined;
    const t = setup({
      revokeApple: async (_tokens, code) => {
        seen = code;
        return "revoked";
      },
    });
    await runAccountDeletion(t.deps, "u1", { appleAuthorizationCode: "abc" });
    expect(seen).toBe("abc");
  });

  test("accounts without Apple skip revocation", async () => {
    const t = setup({ appleTokens: async () => [] });
    const result = await runAccountDeletion(t.deps, "u1");
    expect(result.appleRevoke).toBe("none");
    expect(t.calls).not.toContain("apple");
  });

  test("a failure midway is resumed by running again", async () => {
    let fail = true;
    const t = setup();
    const purgePage = t.deps.purgePage;
    t.deps.purgePage = async (user, table) => {
      if (fail && table === "manga_progress") throw new Error("boom");
      return purgePage(user, table);
    };
    await expect(runAccountDeletion(t.deps, "u1")).rejects.toThrow("boom");
    expect(t.userExists()).toBe(true);
    fail = false;
    await runAccountDeletion(t.deps, "u1");
    expect(Object.values(t.owned).every((count) => count === 0)).toBe(true);
    expect(t.userExists()).toBe(false);
  });

  test("running on an already deleted account succeeds (idempotent)", async () => {
    const t = setup();
    await runAccountDeletion(t.deps, "u1");
    const again = await runAccountDeletion(t.deps, "u1");
    expect(again.appleRevoke).toBe("revoked");
  });
});

const ENV: AppleEnv = {
  APPLE_CLIENT_ID: "pm.nemu.web",
  APPLE_CLIENT_SECRET: "web-secret",
  APPLE_APP_BUNDLE_ID: "pm.nemu",
  APPLE_NATIVE_CLIENT_SECRET: "native-secret",
};

function jwtWithAud(aud: string): string {
  const payload = btoa(JSON.stringify({ aud })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `h.${payload}.s`;
}

type Call = { url: string; params: URLSearchParams };
function recordingFetch(responses: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, params: new URLSearchParams(String(init.body)) });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return new Response(next.body === undefined ? "" : JSON.stringify(next.body), {
      status: next.status,
    });
  }) as never;
  return { calls, fetcher };
}

describe("Sign in with Apple client selection", () => {
  test("reads the audience from an id token and picks the matching client", () => {
    expect(audienceOfIdToken(jwtWithAud("pm.nemu"))).toBe("pm.nemu");
    expect(audienceOfIdToken("garbage")).toBeNull();
    expect(appleClientForAudience("pm.nemu", ENV)).toEqual({
      clientId: "pm.nemu",
      clientSecret: "native-secret",
    });
    expect(appleClientForAudience("pm.nemu.web", ENV)).toEqual({
      clientId: "pm.nemu.web",
      clientSecret: "web-secret",
    });
    // No id token: web OAuth flow, the one the apps use today.
    expect(appleClientForAudience(null, ENV).clientId).toBe("pm.nemu.web");
  });
});

describe("Sign in with Apple revocation request", () => {
  const web = { clientId: "pm.nemu.web", clientSecret: "jwt" };

  test("posts the refresh token with the right hint", async () => {
    const { calls, fetcher } = recordingFetch([{ status: 200 }]);
    const result = await revokeAppleTokens({ refreshToken: "r" }, web, { fetcher });
    expect(result.outcome).toBe("revoked");
    expect(calls[0]!.params.get("token")).toBe("r");
    expect(calls[0]!.params.get("token_type_hint")).toBe("refresh_token");
    expect(calls[0]!.params.get("client_id")).toBe("pm.nemu.web");
  });

  test("falls back to the access token", async () => {
    const { calls, fetcher } = recordingFetch([{ status: 200 }]);
    await revokeAppleTokens({ accessToken: "a" }, web, { fetcher });
    expect(calls[0]!.params.get("token_type_hint")).toBe("access_token");
  });

  test("distinguishes invalid_client, invalid_grant and other 4xx without retrying", async () => {
    for (const [error, outcome] of [
      ["invalid_client", "invalid-client"],
      ["invalid_grant", "already-revoked"],
      ["invalid_request", "rejected"],
    ] as const) {
      const { calls, fetcher } = recordingFetch([{ status: 400, body: { error } }]);
      const result = await revokeAppleTokens({ refreshToken: "r" }, web, { fetcher });
      expect(result).toEqual({ outcome, status: 400 });
      expect(calls).toHaveLength(1);
    }
  });

  test("network errors and 5xx retry then become unavailable", async () => {
    let calls = 0;
    const result = await revokeAppleTokens({ refreshToken: "r" }, web, {
      retries: 1,
      fetcher: (async () => {
        calls++;
        throw new Error("network");
      }) as never,
    });
    expect(result.outcome).toBe("unavailable");
    expect(calls).toBe(2);
  });

  test("reports no-token and not-configured", async () => {
    expect((await revokeAppleTokens({}, web)).outcome).toBe("no-token");
    expect((await revokeAppleTokens({ refreshToken: "r" }, {})).outcome).toBe("not-configured");
  });
});

describe("Sign in with Apple revocation per account", () => {
  test("a stored native idToken revokes with the bundle id client and its secret", async () => {
    const { calls, fetcher } = recordingFetch([{ status: 200 }]);
    const result = await revokeAppleAccount(
      { refreshToken: "r", idToken: jwtWithAud("pm.nemu") },
      undefined,
      ENV,
      { fetcher },
    );
    expect(result.outcome).toBe("revoked");
    expect(calls[0]!.params.get("client_id")).toBe("pm.nemu");
    expect(calls[0]!.params.get("client_secret")).toBe("native-secret");
  });

  test("a web account revokes with the Services ID client", async () => {
    const { calls, fetcher } = recordingFetch([{ status: 200 }]);
    await revokeAppleAccount({ refreshToken: "r" }, undefined, ENV, { fetcher });
    expect(calls[0]!.params.get("client_id")).toBe("pm.nemu.web");
    expect(calls[0]!.params.get("client_secret")).toBe("web-secret");
  });

  test("a native account with only an idToken has nothing to revoke", async () => {
    const result = await revokeAppleAccount(
      { idToken: jwtWithAud("pm.nemu") },
      undefined,
      ENV,
    );
    expect(result.outcome).toBe("no-token");
  });

  test("an authorization code is exchanged at /auth/token, then its refresh token revoked", async () => {
    const { calls, fetcher } = recordingFetch([
      { status: 200, body: { refresh_token: "fresh-r", access_token: "a" } },
      { status: 200 },
    ]);
    const result = await revokeAppleAccount({ idToken: jwtWithAud("pm.nemu") }, "code-1", ENV, {
      fetcher,
    });
    expect(result.outcome).toBe("revoked");
    expect(calls[0]!.url).toBe("https://appleid.apple.com/auth/token");
    expect(calls[0]!.params.get("grant_type")).toBe("authorization_code");
    expect(calls[0]!.params.get("code")).toBe("code-1");
    expect(calls[0]!.params.get("client_id")).toBe("pm.nemu");
    expect(calls[1]!.url).toBe("https://appleid.apple.com/auth/revoke");
    expect(calls[1]!.params.get("token")).toBe("fresh-r");
    expect(calls[1]!.params.get("client_secret")).toBe("native-secret");
  });

  test("a bad authorization code is rejected, never treated as already revoked", async () => {
    const { fetcher } = recordingFetch([{ status: 400, body: { error: "invalid_grant" } }]);
    const result = await revokeAppleAccount({ idToken: jwtWithAud("pm.nemu") }, "stale", ENV, {
      fetcher,
    });
    expect(result.outcome).toBe("rejected");
  });

  test("a failed exchange is reported with its cause", async () => {
    const { fetcher } = recordingFetch([{ status: 400, body: { error: "invalid_grant" } }]);
    const exchanged = await exchangeAppleAuthorizationCode(
      "c",
      { clientId: "pm.nemu", clientSecret: "s" },
      { fetcher },
    );
    expect(exchanged).toMatchObject({ ok: false, outcome: "already-revoked" });
  });
});

describe("R2 key extraction", () => {
  test("only nemu cover URLs map to keys", () => {
    expect(r2KeyFromUrl("https://r2.nemu.pm/abc-123")).toBe("abc-123");
    expect(r2KeyFromUrl("https://r2.nemu.pm/abc-123?v=1")).toBe("abc-123");
    expect(r2KeyFromUrl("https://example.com/abc")).toBeNull();
    expect(r2KeyFromUrl("https://r2.nemu.pm/a/b")).toBeNull();
    expect(r2KeyFromUrl("https://r2.nemu.pm/../x")).toBeNull();
    expect(r2KeyFromUrl(undefined)).toBeNull();
  });

  test("library items yield unique keys from metadata and overrides", () => {
    expect(
      r2KeysOfLibraryItem({
        metadata: { cover: "https://r2.nemu.pm/k1" },
        overrides: { coverUrl: "https://r2.nemu.pm/k1" },
      }),
    ).toEqual(["k1"]);
    expect(
      r2KeysOfLibraryItem({
        metadata: { cover: "https://cdn.example/c.jpg" },
        overrides: { coverUrl: "https://r2.nemu.pm/k2" },
      }),
    ).toEqual(["k2"]);
  });
});

describe("R2 upload ownership", () => {
  beforeAll(() => {
    process.env.R2_BUCKET ??= "bucket";
    process.env.R2_ENDPOINT ??= "https://account.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID ??= "key";
    process.env.R2_SECRET_ACCESS_KEY ??= "secret";
  });

  test("signed-out generateUploadUrl rejects and records nothing", async () => {
    const { generateUploadUrl } = await import("../convex/r2");
    const store = makeDb({});
    await expect(
      run(generateUploadUrl, 
        { auth: identity(null), db: store.db },
        {},
      ),
    ).rejects.toThrow("Not authenticated");
    expect(store.data.r2_uploads ?? []).toHaveLength(0);
  });

  test("signed-in generateUploadUrl creates an ownership row for the returned key", async () => {
    const { generateUploadUrl } = await import("../convex/r2");
    const store = makeDb({});
    const result = await run(generateUploadUrl, 
      { auth: identity("user-a"), db: store.db },
      {},
    );
    expect(result.key).toBeString();
    expect(store.data.r2_uploads).toHaveLength(1);
    expect(store.data.r2_uploads![0]).toMatchObject({
      userId: "user-a",
      key: result.key,
    });
    expect(result.key).not.toContain("user-a");
  });

  test("claiming is idempotent for the owner and rejected for anyone else", async () => {
    const store = makeDb({});
    await claimR2Upload({ auth: identity("user-a"), db: store.db } as never, "k");
    await claimR2Upload({ auth: identity("user-a"), db: store.db } as never, "k");
    expect(store.data.r2_uploads).toHaveLength(1);
    await expect(
      claimR2Upload({ auth: identity("user-b"), db: store.db } as never, "k"),
    ).rejects.toThrow("R2_UPLOAD_FORBIDDEN");
    await expect(
      claimR2Upload({ auth: identity(null), db: store.db } as never, "k2"),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("account deletion internal functions", () => {
  test("purgePage deletes only the target user's rows, one bounded page", async () => {
    const { purgePage } = await import("../convex/accountDeletion");
    const rows: Row[] = [
      ...Array.from({ length: 130 }, (_, i) => ({ _id: `a${i}`, userId: "a" })),
      { _id: "b0", userId: "b" },
    ];
    const store = makeDb({ collections: rows });
    const first = await run(purgePage, 
      { db: store.db },
      { userId: "a", table: "collections" },
    );
    expect(first).toEqual({ deleted: 100, done: false });
    const second = await run(purgePage, 
      { db: store.db },
      { userId: "a", table: "collections" },
    );
    expect(second).toEqual({ deleted: 30, done: true });
    expect(store.data.collections!.map((row) => row._id)).toEqual(["b0"]);
  });

  test("purgePage rejects tables that are not user-owned", async () => {
    const { purgePage } = await import("../convex/accountDeletion");
    await expect(
      run(purgePage, 
        { db: makeDb({}).db },
        { userId: "a", table: "_storage" },
      ),
    ).rejects.toThrow("Not a user-owned table");
  });

  test("r2KeysPage reads keys from ownership rows and library covers", async () => {
    const { r2KeysPage } = await import("../convex/accountDeletion");
    const store = makeDb({
      r2_uploads: [
        { _id: "1", userId: "a", key: "up-1" },
        { _id: "2", userId: "b", key: "other" },
      ],
      library_items: [
        {
          _id: "3",
          userId: "a",
          metadata: { cover: "https://r2.nemu.pm/cover-1" },
        },
      ],
    });
    const ctx = { db: store.db };
    expect(
      await run(r2KeysPage, ctx, {
        userId: "a",
        source: "r2_uploads",
        cursor: null,
      }),
    ).toEqual({ keys: ["up-1"], cursor: null });
    expect(
      await run(r2KeysPage, ctx, {
        userId: "a",
        source: "library_items",
        cursor: null,
      }),
    ).toEqual({ keys: ["cover-1"], cursor: null });
  });
});
