import { describe, expect, test } from "bun:test";
import { selfHostedKindTakesApiKey } from "./policy";

describe("self-hosted policy", () => {
  test("Suwayomi has no API keys", () => {
    expect(selfHostedKindTakesApiKey("suwayomi")).toBe(false);
    expect(selfHostedKindTakesApiKey("komga")).toBe(true);
    expect(selfHostedKindTakesApiKey("kavita")).toBe(true);
  });
});
