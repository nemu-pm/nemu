// OAuth provider type + normalization are shared via @nemu/core (re-exported
// here so existing `@/sync/oauth-provider` importers are unaffected).
export { normalizeOAuthProvider, type OAuthProvider } from "@nemu/core";