import { createMobileLanguageDisplayNameResolver } from "./mobileLanguageDisplayNames";

// iOS's system JavaScriptCore (and web) ship `Intl.DisplayNames`.
export const resolveMobileLanguageDisplayName =
  createMobileLanguageDisplayNameResolver(null);
