import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL,
  plugins: [convexClient(), crossDomainClient()],
});

/** Get auth headers for custom fetch calls to Convex httpAction endpoints. */
export function getAuthHeaders(): Record<string, string> {
  // getCookie() is provided by the crossDomainClient() plugin via getActions.
  // The plugin types don't merge cleanly into createAuthClient's return type,
  // so we cast through unknown. The optional chain guards against the method
  // being absent if the plugin is ever removed.
  const cookie = (authClient as unknown as { getCookie?: () => string }).getCookie?.();
  if (cookie) return { "Better-Auth-Cookie": cookie };
  return {};
}
