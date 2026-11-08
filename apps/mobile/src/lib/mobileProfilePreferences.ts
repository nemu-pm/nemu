/**
 * Language and theme are device-feeling choices stored per data profile, and
 * they are not synced. A first sign-in or a Remove data moves to a profile that
 * has never stored them, so the app fell back to the device language and the
 * system theme: reading in Japanese chosen during onboarding, then signing in,
 * turned the whole app English. The running app remembers what it last read or
 * wrote; a profile without its own choice takes that and stores it. A profile's
 * own stored choice always wins.
 */
export type MobileProfilePreferences = {
  appLanguage?: string;
  metadataLanguagePreference?: string;
  themePreference?: string;
};

type Key = keyof MobileProfilePreferences;

export function createMobileProfilePreferenceCarry() {
  let remembered: MobileProfilePreferences = {};
  return {
    remember(key: Key, value: string): void {
      remembered = { ...remembered, [key]: value };
    },
    /**
     * What this profile should use for `keys`, and which of them it lacks and
     * should store (`missing`).
     */
    adopt<Keys extends Key>(
      stored: MobileProfilePreferences,
      keys: readonly Keys[],
    ): { values: Pick<MobileProfilePreferences, Keys>; missing: Pick<MobileProfilePreferences, Keys> } {
      const values: MobileProfilePreferences = {};
      const missing: MobileProfilePreferences = {};
      for (const key of keys) {
        const own = stored[key];
        if (own !== undefined) {
          values[key] = own;
          remembered = { ...remembered, [key]: own };
        } else if (remembered[key] !== undefined) {
          values[key] = remembered[key];
          missing[key] = remembered[key];
        }
      }
      return { values, missing };
    },
    /** A full local reset: nothing carries over. */
    forget(): void {
      remembered = {};
    },
  };
}

export const mobileProfilePreferenceCarry = createMobileProfilePreferenceCarry();
