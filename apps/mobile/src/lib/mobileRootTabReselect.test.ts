import { describe, expect, test } from "bun:test";
import {
  emitMobileRootTabReselect,
  subscribeMobileRootTabReselect,
} from "./mobileRootTabReselect";

describe("mobile root tab reselect events", () => {
  test("notifies subscribers for the matching tab only", () => {
    let libraryCount = 0;
    let browseCount = 0;
    const unsubscribeLibrary = subscribeMobileRootTabReselect("/library", () => {
      libraryCount += 1;
    });
    const unsubscribeBrowse = subscribeMobileRootTabReselect("/browse", () => {
      browseCount += 1;
    });

    emitMobileRootTabReselect("/library");

    expect(libraryCount).toBe(1);
    expect(browseCount).toBe(0);

    unsubscribeLibrary();
    unsubscribeBrowse();
  });

  test("stops notifying after unsubscribe", () => {
    let count = 0;
    const unsubscribe = subscribeMobileRootTabReselect("/settings", () => {
      count += 1;
    });

    unsubscribe();
    emitMobileRootTabReselect("/settings");

    expect(count).toBe(0);
  });
});
