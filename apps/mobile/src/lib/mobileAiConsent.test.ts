import { afterEach, describe, expect, test } from "bun:test";
import {
  MOBILE_AI_CONSENT_KEY,
  MobileAiConsentDeclinedError,
  registerMobileAiConsentPresenter,
  requireMobileAiConsent,
  setMobileAiConsentStoreForTesting,
} from "./mobileAiConsent";

function memoryStore(initial?: string) {
  const map = new Map<string, string>(initial ? [[MOBILE_AI_CONSENT_KEY, initial]] : []);
  return {
    map,
    getString: async (k: string) => map.get(k) ?? null,
    setString: async (k: string, v: string) => void map.set(k, v),
  };
}

// Restore the pre-accepted store the test preload installs for other files.
afterEach(() => {
  setMobileAiConsentStoreForTesting({
    getString: async (key) =>
      key === MOBILE_AI_CONSENT_KEY ? JSON.stringify({ version: 1 }) : null,
    setString: async () => undefined,
  });
});

describe("requireMobileAiConsent", () => {
  test("asks once, stores the version, and does not ask again", async () => {
    const store = memoryStore();
    setMobileAiConsentStoreForTesting(store);
    let asked = 0;
    const off = registerMobileAiConsentPresenter(async () => (asked++, true));
    await requireMobileAiConsent();
    await requireMobileAiConsent();
    expect(asked).toBe(1);
    expect(JSON.parse(store.map.get(MOBILE_AI_CONSENT_KEY)!).version).toBe(1);
    off();
  });

  test("declining cancels the action, stores nothing, and asks again next time", async () => {
    const store = memoryStore();
    setMobileAiConsentStoreForTesting(store);
    let asked = 0;
    const off = registerMobileAiConsentPresenter(async () => (asked++, false));
    await expect(requireMobileAiConsent()).rejects.toBeInstanceOf(MobileAiConsentDeclinedError);
    await expect(requireMobileAiConsent()).rejects.toBeInstanceOf(MobileAiConsentDeclinedError);
    expect(asked).toBe(2);
    expect(store.map.size).toBe(0);
    off();
  });

  test("a stored consent with an older version is asked again", async () => {
    const store = memoryStore(JSON.stringify({ version: 0 }));
    setMobileAiConsentStoreForTesting(store);
    let asked = 0;
    const off = registerMobileAiConsentPresenter(async () => (asked++, true));
    await requireMobileAiConsent();
    expect(asked).toBe(1);
    off();
  });

  test("concurrent callers share one sheet; no presenter means decline", async () => {
    setMobileAiConsentStoreForTesting(memoryStore());
    await expect(requireMobileAiConsent()).rejects.toBeInstanceOf(MobileAiConsentDeclinedError);
    let asked = 0;
    const off = registerMobileAiConsentPresenter(async () => (asked++, true));
    await Promise.all([requireMobileAiConsent(), requireMobileAiConsent()]);
    expect(asked).toBe(1);
    off();
  });
});
