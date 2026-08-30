// Base (non-native) auth client.
//
// Metro resolves `mobileAuthClient.native.ts` on native (iOS/Android), which
// holds the real `expoClient` + `expo-secure-store` + `react-native` `Platform`
// branch (cookie prefix `nemu`, scheme/storage prefixes unchanged). This base
// file is what bun's test runner and Expo web resolve instead — it keeps only
// the web `crossDomainClient()` branch, with no `expo-secure-store` or
// `react-native` import, so it loads under bun (the RN `.js.flow` `typeof`
// imports otherwise crash the runner). Native auth/cookie/session continuity
// is byte-for-byte unchanged. See `CONTRIBUTING.md` for the convention.

import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createFailClosedMobileAuthFetch } from "./mobileAuthSecureStorage";
import { mobileSyncConfig } from "./mobileSyncConfig";

export const mobileAuthClient = createAuthClient({
  baseURL: mobileSyncConfig.siteUrl ?? "",
  fetchOptions: { customFetchImpl: createFailClosedMobileAuthFetch() },
  plugins: [convexClient(), crossDomainClient()],
});
