import { describe, expect, test } from "bun:test";
import { createMobileOriginBridge } from "../convex/authMobileOriginBridge";

const siteUrl = "https://nemu.pm";

function contextWith(trusted: string[]) {
  const ctx = {
    isTrustedOrigin: (url: string) => trusted.includes(url),
  };
  return ctx as unknown as Parameters<
    NonNullable<ReturnType<typeof createMobileOriginBridge>["onRequest"]>
  >[1];
}

function bridged(headers: Record<string, string>) {
  const ctx = contextWith([siteUrl]);
  const request = new Request("https://deployment.convex.site/api/auth/sign-in/social", {
    method: "POST",
    headers,
  });
  const plugin = createMobileOriginBridge({ siteUrl });
  return { ctx, run: () => plugin.onRequest!(request, ctx) };
}

describe("mobile origin bridge", () => {
  test("rewrites a native request's Origin to the trusted site URL", async () => {
    const { run } = bridged({ "expo-origin": "nemu://" });
    const result = (await run()) as { request: Request } | undefined;
    expect(result?.request.headers.get("origin")).toBe(siteUrl);
  });

  test("keeps Better Auth's origin and callbackURL validation enabled", async () => {
    const { ctx, run } = bridged({ "expo-origin": "nemu://" });
    await run();
    const context = ctx as unknown as { skipOriginCheck?: unknown };
    expect(context.skipOriginCheck).toBeUndefined();
    expect(ctx.isTrustedOrigin("nemu://settings")).toBe(true);
    expect(ctx.isTrustedOrigin("pm.nemu://oauth/callback")).toBe(true);
    expect(ctx.isTrustedOrigin(siteUrl)).toBe(true);
    expect(ctx.isTrustedOrigin("https://evil.example/steal")).toBe(false);
  });

  test("ignores browser requests and non-app expo origins", async () => {
    const withOrigin = bridged({
      origin: "https://evil.example",
      "expo-origin": "nemu://",
    });
    expect(await withOrigin.run()).toBeUndefined();
    expect(withOrigin.ctx.isTrustedOrigin("nemu://settings")).toBe(false);

    const foreign = bridged({ "expo-origin": "https://evil.example" });
    expect(await foreign.run()).toBeUndefined();

    const missing = bridged({});
    expect(await missing.run()).toBeUndefined();
  });
});
