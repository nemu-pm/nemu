import { describe, expect, test } from "bun:test";
import {
  MOBILE_SEARCH_RECENTS_LIMIT,
  addMobileSearchRecent,
  loadMobileSearchRecents,
  mobileSearchRecentsScopeKey,
  normalizeMobileSearchRecentQuery,
  parseMobileSearchRecents,
  removeMobileSearchRecent,
  saveMobileSearchRecents,
  serializeMobileSearchRecents,
} from "./mobileSearchRecents";

describe("recent searches", () => {
  test("normalizes whitespace and ignores empty queries", () => {
    expect(normalizeMobileSearchRecentQuery("  sousou   no  frieren ")).toBe("sousou no frieren");
    expect(addMobileSearchRecent(["a"], "   ")).toEqual(["a"]);
  });

  test("most recent first, de-duplicated case-insensitively, capped", () => {
    expect(addMobileSearchRecent(["Frieren", "Dandadan"], "frieren")).toEqual(["frieren", "Dandadan"]);
    const many = Array.from({ length: 20 }, (_, index) => `q${index}`);
    const next = addMobileSearchRecent(many, "new");
    expect(next).toHaveLength(MOBILE_SEARCH_RECENTS_LIMIT);
    expect(next[0]).toBe("new");
  });

  test("removes a query", () => {
    expect(removeMobileSearchRecent(["Frieren", "Dandadan"], "frieren")).toEqual(["Dandadan"]);
  });

  test("round-trips and tolerates corrupt files", () => {
    const text = serializeMobileSearchRecents(["frieren", "dandadan"]);
    expect(parseMobileSearchRecents(text)).toEqual(["frieren", "dandadan"]);
    expect(parseMobileSearchRecents("{not json")).toEqual([]);
    expect(parseMobileSearchRecents(JSON.stringify({ queries: [1, "a", null, "A"] }))).toEqual(["a"]);
    expect(parseMobileSearchRecents(null)).toEqual([]);
  });

  test("scope keys are file-name safe and do not expose the scope", () => {
    const key = mobileSearchRecentsScopeKey("account:user_123@example.com");
    expect(key).toMatch(/^[a-z0-9]+$/);
    expect(key).not.toContain("user");
    expect(mobileSearchRecentsScopeKey("local")).not.toBe(key);
  });

  test("persists per profile scope", async () => {
    await saveMobileSearchRecents(["frieren"], "profile-a");
    await saveMobileSearchRecents(["dandadan"], "profile-b");
    expect(await loadMobileSearchRecents("profile-a")).toEqual(["frieren"]);
    expect(await loadMobileSearchRecents("profile-b")).toEqual(["dandadan"]);
  });
});
