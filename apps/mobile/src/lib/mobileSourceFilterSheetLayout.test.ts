import { describe, expect, test } from "bun:test";
import { getMobileSourceFilterSheetLayout } from "./mobileSourceFilterSheetLayout";

describe("getMobileSourceFilterSheetLayout", () => {
  test("hugs the capped filter content on a regular portrait phone", () => {
    expect(
      getMobileSourceFilterSheetLayout({
        fontScale: 1,
        height: 915,
        width: 412,
      }),
    ).toEqual({ bounded: false, snapPoints: undefined });
  });

  test("bounds short and landscape viewports", () => {
    expect(
      getMobileSourceFilterSheetLayout({
        fontScale: 1,
        height: 667,
        width: 375,
      }),
    ).toEqual({ bounded: true, snapPoints: ["88%"] });
    expect(
      getMobileSourceFilterSheetLayout({
        fontScale: 1,
        height: 412,
        width: 915,
      }),
    ).toEqual({ bounded: true, snapPoints: ["88%"] });
  });

  test("bounds accessibility text sizes", () => {
    expect(
      getMobileSourceFilterSheetLayout({
        fontScale: 1.6,
        height: 915,
        width: 412,
      }),
    ).toEqual({ bounded: true, snapPoints: ["88%"] });
  });
});
