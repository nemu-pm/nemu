import { describe, expect, test } from "bun:test";
import { createNemuShadowStyleForPlatform } from "./shadowStyles";

describe("createNemuShadowStyle", () => {
  test("uses boxShadow on web without legacy shadow props", () => {
    expect(
      createNemuShadowStyleForPlatform(
        {
          color: "rgba(67,56,119,0.14)",
          offsetY: 3,
          radius: 14,
          elevation: 4,
        },
        "web",
      ),
    ).toEqual({
      boxShadow: "0px 3px 14px rgba(67,56,119,0.14)",
    });
  });

  test("preserves native shadow and elevation props off web", () => {
    expect(
      createNemuShadowStyleForPlatform(
        {
          color: "rgba(67,56,119,0.14)",
          offsetY: 3,
          radius: 14,
          elevation: 4,
        },
        "ios",
      ),
    ).toEqual({
      shadowColor: "rgba(67,56,119,0.14)",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 14,
      elevation: 4,
    });
  });

  test("folds native opacity into hex colors for web", () => {
    expect(
      createNemuShadowStyleForPlatform(
        {
          color: "#000",
          offsetY: 10,
          radius: 18,
          opacity: 0.22,
          elevation: 8,
        },
        "web",
      ),
    ).toEqual({
      boxShadow: "0px 10px 18px rgba(0,0,0,0.22)",
    });
  });
});
