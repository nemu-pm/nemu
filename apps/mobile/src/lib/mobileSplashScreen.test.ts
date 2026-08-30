import { describe, expect, test } from "bun:test";
import { shouldHideMobileSplashScreen } from "./mobileSplashScreen";

describe("mobile splash screen", () => {
  test("hides only after root layout and before the splash has been hidden", () => {
    expect(
      shouldHideMobileSplashScreen({
        rootLaidOut: false,
        splashHidden: false,
      }),
    ).toBe(false);
    expect(
      shouldHideMobileSplashScreen({
        rootLaidOut: true,
        splashHidden: true,
      }),
    ).toBe(false);
    expect(
      shouldHideMobileSplashScreen({
        rootLaidOut: true,
        splashHidden: false,
      }),
    ).toBe(true);
  });
});
