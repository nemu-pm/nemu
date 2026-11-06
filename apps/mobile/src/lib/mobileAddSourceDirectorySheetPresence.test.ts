import { describe, expect, test } from "bun:test";
import {
  closeMobileAddSourceDirectorySheet,
  registerMobileAddSourceDirectorySheet,
} from "./mobileAddSourceDirectorySheetPresence";

describe("closeMobileAddSourceDirectorySheet", () => {
  test("resolves at once with no sheet up", async () => {
    await expect(closeMobileAddSourceDirectorySheet()).resolves.toBeUndefined();
  });

  test("waits for the open sheet, and forgets it once unregistered", async () => {
    let closes = 0;
    let dismissed = () => {};
    const unregister = registerMobileAddSourceDirectorySheet(
      () =>
        new Promise((resolve) => {
          closes += 1;
          dismissed = resolve;
        }),
    );
    let settled = false;
    const closing = closeMobileAddSourceDirectorySheet().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(closes).toBe(1);
    expect(settled).toBe(false);
    dismissed();
    await closing;
    expect(settled).toBe(true);
    unregister();
    await closeMobileAddSourceDirectorySheet();
    expect(closes).toBe(1);
  });

  test("a stale unregister leaves a newer sheet in place", async () => {
    let closes = 0;
    const stale = registerMobileAddSourceDirectorySheet(async () => {});
    const unregister = registerMobileAddSourceDirectorySheet(async () => {
      closes += 1;
    });
    stale();
    await closeMobileAddSourceDirectorySheet();
    expect(closes).toBe(1);
    unregister();
  });
});
