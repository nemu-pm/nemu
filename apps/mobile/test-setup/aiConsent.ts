// Unit tests exercise the AI call paths directly; pre-accept the one-time
// third-party AI notice so they reach the network layer. mobileAiConsent.test.ts
// installs its own stores.
import {
  MOBILE_AI_CONSENT_KEY,
  MOBILE_AI_CONSENT_VERSION,
  setMobileAiConsentStoreForTesting,
} from "../src/lib/mobileAiConsent";

setMobileAiConsentStoreForTesting({
  getString: async (key) =>
    key === MOBILE_AI_CONSENT_KEY ? JSON.stringify({ version: MOBILE_AI_CONSENT_VERSION }) : null,
  setString: async () => undefined,
});
