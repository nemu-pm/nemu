import { describe, expect, test } from "bun:test";
import {
  canOpenMobileAboutSourceCode,
  isMobileAboutActionBusy,
} from "./mobileAboutActions";

describe("mobile about actions", () => {
  test("gates source-code link opens while an external link is active", () => {
    const idle = { openingSourceCode: false };
    const opening = { openingSourceCode: true };

    expect(isMobileAboutActionBusy(idle)).toBe(false);
    expect(canOpenMobileAboutSourceCode(idle)).toBe(true);
    expect(isMobileAboutActionBusy(opening)).toBe(true);
    expect(canOpenMobileAboutSourceCode(opening)).toBe(false);
  });
});
