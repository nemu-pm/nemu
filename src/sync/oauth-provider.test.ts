import { describe, expect, it } from "bun:test";
import { normalizeOAuthProvider } from "./oauth-provider";

describe("normalizeOAuthProvider", () => {
  it("keeps supported OAuth providers", () => {
    expect(normalizeOAuthProvider("google")).toBe("google");
    expect(normalizeOAuthProvider("apple")).toBe("apple");
  });

  it("hides unsupported or missing providers", () => {
    expect(normalizeOAuthProvider("credential")).toBeNull();
    expect(normalizeOAuthProvider(null)).toBeNull();
    expect(normalizeOAuthProvider(undefined)).toBeNull();
  });
});
