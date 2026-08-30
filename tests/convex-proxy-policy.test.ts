import { describe, expect, test } from "bun:test";
import {
  normalizeMangaUpdatesSearchBody,
  validateConvexProxyTarget,
} from "../convex/proxy";

describe("Convex MangaUpdates relay policy", () => {
  test("allows only the exact API origin, route, and method contract", () => {
    expect(
      validateConvexProxyTarget(
        "https://api.mangaupdates.com/v1/series/search",
        "POST",
      )?.href,
    ).toBe("https://api.mangaupdates.com/v1/series/search");
    expect(
      validateConvexProxyTarget(
        "https://api.mangaupdates.com/v1/series/123",
        "GET",
      )?.href,
    ).toBe("https://api.mangaupdates.com/v1/series/123");
    expect(
      validateConvexProxyTarget(
        "https://api.mangaupdates.com/v1/authors/456",
        "GET",
      )?.href,
    ).toBe("https://api.mangaupdates.com/v1/authors/456");
  });

  test("rejects generic relay, credential, query, and method escapes", () => {
    for (const [target, method] of [
      ["http://api.mangaupdates.com/v1/series/1", "GET"],
      ["https://user:secret@api.mangaupdates.com/v1/series/1", "GET"],
      ["https://api.mangaupdates.com.attacker.test/v1/series/1", "GET"],
      ["https://api.mangaupdates.com/v1/series/1?override=true", "GET"],
      ["https://api.mangaupdates.com/v1/series/search", "GET"],
      ["https://api.mangaupdates.com/v1/series/1", "POST"],
      ["https://api.mangaupdates.com/v1/admin", "GET"],
    ]) {
      expect(validateConvexProxyTarget(target, method), target).toBeNull();
    }
  });

  test("normalizes only a bounded search payload", () => {
    expect(
      normalizeMangaUpdatesSearchBody(
        JSON.stringify({ search: "Frieren", per_page: 5, ignored: "value" }),
      ),
    ).toBe(JSON.stringify({ search: "Frieren", per_page: 5 }));

    for (const value of [
      "not-json",
      JSON.stringify({ search: "", per_page: 5 }),
      JSON.stringify({ search: "a".repeat(257), per_page: 5 }),
      JSON.stringify({ search: "Frieren", per_page: 0 }),
      JSON.stringify({ search: "Frieren", per_page: 21 }),
      JSON.stringify({ search: "Frieren", per_page: 1.5 }),
    ]) {
      expect(normalizeMangaUpdatesSearchBody(value), value).toBeNull();
    }
  });
});
