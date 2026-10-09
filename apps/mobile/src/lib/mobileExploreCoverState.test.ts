import { describe, expect, test } from "bun:test";
import { resolveMobileExploreCoverState } from "./mobileExploreCoverState";

describe("resolveMobileExploreCoverState", () => {
  test("waits while the image loads", () => {
    expect(resolveMobileExploreCoverState({ hasSource: true, loaded: false, failed: false })).toBe("loading");
  });
  test("shows the image once loaded", () => {
    expect(resolveMobileExploreCoverState({ hasSource: true, loaded: true, failed: false })).toBe("loaded");
  });
  test("no cover or a failed load shows the titled book, not a spinner", () => {
    expect(resolveMobileExploreCoverState({ hasSource: false, loaded: false, failed: false })).toBe("failed");
    expect(resolveMobileExploreCoverState({ hasSource: true, loaded: false, failed: true })).toBe("failed");
    expect(resolveMobileExploreCoverState({ hasSource: true, loaded: true, failed: true })).toBe("failed");
  });
});
