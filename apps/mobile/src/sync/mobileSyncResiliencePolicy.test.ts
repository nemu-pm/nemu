import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function mobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

/**
 * Sync resilience wiring that must survive refactors:
 *  - first-sync progress drives the toast through the external store seam,
 *  - auth transport retries transient failures instead of reporting false
 *    "network unavailable" states.
 */
describe("mobile sync resilience policy", () => {
  test("first-sync progress is tracked, paused, and reset by the bridge", () => {
    const bridge = mobileSource("sync/MobileSyncProvider.tsx");
    expect(bridge).toContain("beginMobileSyncProgress(");
    expect(bridge).toContain("pauseMobileSyncProgress(");
    expect(bridge).toContain("resetMobileSyncProgress(");
    expect(bridge).toContain("markMobileSyncProgressDomain(");
  });

  test("the progress toast renders inside the toast provider", () => {
    const layout = mobileSource("../app/_layout.tsx");
    expect(layout).toContain("MobileSyncProgressToast");
    const toast = mobileSource("components/MobileSyncProgressToast.tsx");
    expect(toast).toContain("subscribeMobileSyncProgress");
    expect(toast).toContain('duration: "sticky"');
  });

  test("the progress toast is gated on a configured Convex provider", () => {
    // useConvexAuth throws without ConvexProviderWithAuth, and
    // MobileSyncProvider renders bare children when sync is unconfigured —
    // the root layout renders this toast unconditionally.
    const toast = mobileSource("components/MobileSyncProgressToast.tsx");
    expect(toast).toContain("if (!mobileSyncConfig.configured) return null;");
    // The single-slot toast host means a sticky toast mutes every other
    // toast until it resolves, so the syncing state must always expire.
    expect(toast).toContain("MOBILE_SYNC_PROGRESS_STICKY_MAX_MS");
  });

  test("auth fetch retries transient transport failures before failing closed", () => {
    const storage = mobileSource("sync/mobileAuthSecureStorage.ts");
    expect(storage).toContain("runMobileHttpRequestWithRetry");
  });
});
