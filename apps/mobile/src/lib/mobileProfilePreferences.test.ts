import { describe, expect, test } from "bun:test";
import { createMobileProfilePreferenceCarry } from "./mobileProfilePreferences";

describe("createMobileProfilePreferenceCarry", () => {
  test("a profile's own choice wins and is what carries on", () => {
    const carry = createMobileProfilePreferenceCarry();
    carry.remember("appLanguage", "ja");
    expect(carry.adopt({ appLanguage: "zh" }, ["appLanguage"])).toEqual({
      values: { appLanguage: "zh" },
      missing: {},
    });
    expect(carry.adopt({}, ["appLanguage"]).values).toEqual({ appLanguage: "zh" });
  });

  test("a new profile takes the language chosen before signing in, to store it", () => {
    const carry = createMobileProfilePreferenceCarry();
    carry.remember("appLanguage", "ja");
    expect(carry.adopt({}, ["appLanguage"])).toEqual({
      values: { appLanguage: "ja" },
      missing: { appLanguage: "ja" },
    });
  });

  test("with nothing remembered the device default still applies", () => {
    const carry = createMobileProfilePreferenceCarry();
    expect(carry.adopt({}, ["appLanguage", "themePreference"])).toEqual({ values: {}, missing: {} });
  });

  test("each provider adopts only its own keys", () => {
    const carry = createMobileProfilePreferenceCarry();
    carry.remember("appLanguage", "ja");
    carry.remember("themePreference", "dark");
    expect(carry.adopt({}, ["themePreference"]).missing).toEqual({ themePreference: "dark" });
  });

  test("a full reset carries nothing", () => {
    const carry = createMobileProfilePreferenceCarry();
    carry.remember("appLanguage", "ja");
    carry.forget();
    expect(carry.adopt({}, ["appLanguage"]).values).toEqual({});
  });
});
