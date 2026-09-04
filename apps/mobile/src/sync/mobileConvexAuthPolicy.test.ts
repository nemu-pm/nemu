import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * Convex's authentication manager (convex@1.31) gives a token fetch two
 * chances and then permanently gives up; @convex-dev/better-auth never
 * re-arms it. A transient native HTTP failure right after OAuth therefore
 * left the app signed-in with every sync subscription silently skipped and an
 * empty library. These policies pin the recovery wiring that must survive
 * refactors: the custom provider with the stall watchdog, and the Settings
 * surface that makes the failure visible and retryable.
 */
describe("mobile convex auth recovery policy", () => {
  test("sync uses the resilient MobileConvexAuthProvider, not the library default", () => {
    const provider = mobileSource("sync/MobileSyncProvider.tsx");
    expect(provider).toContain("MobileConvexAuthProvider");
    expect(provider).not.toContain("ConvexBetterAuthProvider");
  });

  test("the provider re-arms setAuth through fetchAccessToken identity", () => {
    const auth = mobileSource("sync/mobileConvexAuth.tsx");
    // Identity must depend on the re-arm epoch so ConvexProviderWithAuth
    // calls setAuth() again after the auth manager gave up.
    expect(auth).toContain("[sessionId, rearmEpoch]");
    expect(auth).toContain("ConvexProviderWithAuth");
    // The stall watchdog must observe the settled session + unauthenticated
    // Convex state, retry on AppState active, and expose a manual retry.
    expect(auth).toContain("MobileConvexAuthStallWatchdog");
    expect(auth).toContain('state === "active"');
    // The manual retry lives in a component-free module so the provider file
    // stays fast-refresh clean; the provider must still register a handler.
    expect(auth).toContain("setMobileConvexAuthRetryHandler(rearm)");
    const retry = mobileSource("sync/mobileConvexAuthRetry.ts");
    expect(retry).toContain("export function retryMobileConvexAuth()");
  });

  test("the cloud sync card surfaces a stalled transport with a retry action", () => {
    const card = mobileSource("components/MobileCloudSyncCard.tsx");
    expect(card).toContain("useConvexAuth()");
    expect(card).toContain("convexAuthStalled");
    expect(card).toContain("retryMobileConvexAuth()");
    expect(card).toContain("cloudSyncTransportStalled");
  });
});
