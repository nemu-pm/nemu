import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  createFailClosedMobileAuthStorage,
  createFailClosedMobileAuthFetch,
} from "./mobileAuthSecureStorage";
import { mobileSyncConfig } from "./mobileSyncConfig";

const mobileAuthStorage = createFailClosedMobileAuthStorage({
  getItem: (key) => SecureStore.getItem(key),
  setItem: (key, value) => SecureStore.setItem(key, value),
});

export const mobileAuthClient = createAuthClient({
  baseURL: mobileSyncConfig.siteUrl ?? "",
  fetchOptions: { customFetchImpl: createFailClosedMobileAuthFetch() },
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
