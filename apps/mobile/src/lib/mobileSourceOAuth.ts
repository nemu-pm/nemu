// Platform seam for source OAuth PKCE login. The pure logic lives in
// `mobileSourceOAuthLogic.ts` (no expo/RN imports → unit-testable under bun).
// This base module is what tsc + bun tests + Expo web resolve; it re-exports
// the logic and provides a stub `runMobileSourceOAuthLogin` that throws so the
// flow is never silently treated as a no-op off-native. The real implementation
// lives in `mobileSourceOAuth.native.ts` (resolved by Metro on native).
//
// `export *` keeps this seam drift-proof: any new helper added to the logic
// module is re-exported here and in the `.native` twin automatically, so the
// two files never need a synchronized named-export list.
export * from "./mobileSourceOAuthLogic";

import type { MobileSourceOAuthLoginInput, MobileSourceOAuthLoginResult } from "./mobileSourceOAuthLogic";

// Base stub resolved by tsc, bun tests, and Expo web. Always rejects — the real
// PKCE flow lives in `mobileSourceOAuth.native.ts` (resolved by Metro on native).
export async function runMobileSourceOAuthLogin(
  input: MobileSourceOAuthLoginInput,
): Promise<MobileSourceOAuthLoginResult> {
  void input;
  return {
    ok: false,
    code: "unsupported-platform",
  };
}
