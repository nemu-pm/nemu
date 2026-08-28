import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createMobileAuthChunkCleanupStorage,
  createFailClosedMobileAuthStorage,
  createFailClosedMobileAuthFetch,
  createHttpsOnlyMobileAuthFetch,
} from "./mobileAuthSecureStorage";
import { mobileSyncConfig } from "./mobileSyncConfig";
import { mobileNativeFetch } from "@/sources/mobileNativeHttp";

const mobileAuthChunkStorage = createMobileAuthChunkCleanupStorage(
  {
    getItem: (key) => SecureStore.getItem(key),
    setItem: (key, value) => SecureStore.setItem(key, value),
    deleteItem: (key) => SecureStore.deleteItemAsync(key),
  },
  {
    storagePrefix: mobileSyncConfig.scheme,
  },
);
// Resume non-secret stale-chunk cleanup left by a terminated auth write. A
// failure stays retryable through the durable journal and must not log keys or
// native error text, both of which can reveal authentication state.
void mobileAuthChunkStorage.recoverStaleChunks().catch(() => undefined);

const mobileAuthStorage = createFailClosedMobileAuthStorage(
  mobileAuthChunkStorage,
);

export const mobileAuthClient = createAuthClient({
  baseURL: mobileSyncConfig.siteUrl ?? "",
  fetchOptions: {
    customFetchImpl: createFailClosedMobileAuthFetch(
      createHttpsOnlyMobileAuthFetch(mobileNativeFetch),
    ),
  },
  plugins: [
    convexClient(),
    ...(Platform.OS === "web"
      ? [crossDomainClient()]
      : [
          expoClient({
            scheme: mobileSyncConfig.scheme,
            storagePrefix: mobileSyncConfig.scheme,
            cookiePrefix: "nemu",
            storage: mobileAuthStorage,
          }),
        ]),
  ],
});
