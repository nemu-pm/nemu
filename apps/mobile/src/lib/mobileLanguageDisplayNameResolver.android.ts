import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import { createMobileLanguageDisplayNameResolver } from "./mobileLanguageDisplayNames";

// Android's JavaScriptCore has no `Intl`; ask the platform's ICU instead.
export const resolveMobileLanguageDisplayName =
  createMobileLanguageDisplayNameResolver((codes, displayLanguage) =>
    NemuAidokuModule.getLanguageDisplayNames?.(codes, displayLanguage),
  );
