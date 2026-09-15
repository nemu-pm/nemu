import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearMobileAppLocalImageUris,
  forgetMobileAppLocalImageUri,
  isMobileAppLocalImageUri,
  registerMobileAppLocalImageUri,
} from "./mobileAppLocalImageUris";

describe("mobile app-local image URIs", () => {
  beforeEach(() => {
    clearMobileAppLocalImageUris();
  });

  test("only recognizes URIs the app registered", () => {
    const minted = "file:///cache/nemu-processed-covers/cover-a.png";
    expect(isMobileAppLocalImageUri(minted)).toBe(false);

    registerMobileAppLocalImageUri(minted);
    expect(isMobileAppLocalImageUri(minted)).toBe(true);
    // A source cannot spell its way into the set.
    expect(
      isMobileAppLocalImageUri("file:///cache/nemu-processed-covers/cover-b.png"),
    ).toBe(false);
    expect(isMobileAppLocalImageUri(`${minted}?x=1`)).toBe(false);
  });

  test("forgets a deleted file and ignores empty input", () => {
    const minted = "file:///cache/nemu-processed-covers/cover-a.png";
    registerMobileAppLocalImageUri(minted);
    forgetMobileAppLocalImageUri(minted);
    expect(isMobileAppLocalImageUri(minted)).toBe(false);

    registerMobileAppLocalImageUri("");
    expect(isMobileAppLocalImageUri("")).toBe(false);
  });

  test("stays bounded and keeps the most recently registered URIs", () => {
    for (let index = 0; index < 600; index += 1) {
      registerMobileAppLocalImageUri(`file:///cache/cover-${index}.png`);
    }

    expect(isMobileAppLocalImageUri("file:///cache/cover-0.png")).toBe(false);
    expect(isMobileAppLocalImageUri("file:///cache/cover-599.png")).toBe(true);
  });

  test("re-registering refreshes eviction order", () => {
    const kept = "file:///cache/cover-kept.png";
    registerMobileAppLocalImageUri(kept);
    for (let index = 0; index < 400; index += 1) {
      registerMobileAppLocalImageUri(`file:///cache/cover-${index}.png`);
      registerMobileAppLocalImageUri(kept);
    }

    expect(isMobileAppLocalImageUri(kept)).toBe(true);
  });
});
