import { describe, expect, test } from "bun:test";
import {
  consumeMobileAddSourceSheetRequest,
  hasPendingMobileAddSourceSheetRequest,
  requestMobileAddSourceSheet,
  subscribeMobileAddSourceSheetRequest,
} from "./mobileAddSourceSheetRequest";

describe("Add Sources sheet request", () => {
  test("is consumed exactly once", () => {
    expect(consumeMobileAddSourceSheetRequest()).toBe(false);
    requestMobileAddSourceSheet();
    expect(hasPendingMobileAddSourceSheetRequest()).toBe(true);
    expect(consumeMobileAddSourceSheetRequest()).toBe(true);
    expect(hasPendingMobileAddSourceSheetRequest()).toBe(false);
    // A later Browse visit must not reopen the sheet.
    expect(consumeMobileAddSourceSheetRequest()).toBe(false);
  });

  test("waits for a Browse screen that is not mounted yet", () => {
    requestMobileAddSourceSheet();
    // No subscriber: the request stays pending until Browse mounts and reads it.
    expect(consumeMobileAddSourceSheetRequest()).toBe(true);
  });

  test("notifies an already-mounted Browse screen", () => {
    let calls = 0;
    const unsubscribe = subscribeMobileAddSourceSheetRequest(() => {
      calls += 1;
      expect(consumeMobileAddSourceSheetRequest()).toBe(true);
    });
    requestMobileAddSourceSheet();
    expect(calls).toBe(1);
    expect(hasPendingMobileAddSourceSheetRequest()).toBe(false);
    unsubscribe();
    requestMobileAddSourceSheet();
    expect(calls).toBe(1);
    expect(consumeMobileAddSourceSheetRequest()).toBe(true);
  });
});
