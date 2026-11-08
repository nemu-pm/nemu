import { describe, expect, test } from "bun:test";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";

const text = JSON.stringify(en.privacy);

describe("privacy policy copy", () => {
  test("names every third party that can receive content, and the support link", () => {
    for (const name of [
      "Anthropic",
      "Google",
      "ElevenLabs",
      "Vercel",
      "Cloudflare",
      "Convex",
      "Apple",
      "vast.ai",
      "ocr.nemu.pm",
      "ichiran.komi.to",
      "service.nemu.pm",
      "AniList",
      "https://github.com/nemu-pm/nemu/issues",
    ]) {
      expect(text).toContain(name);
    }
  });

  test("makes no claim that contradicts the data-flow audit", () => {
    // No analytics, no 30-day diagnostics schedule, no cloud chat storage, no
    // "operator" (nemu has none).
    expect(text.toLowerCase()).not.toContain("operator");
    expect(text).toContain("does not store diagnostic records");
    expect(text).toContain("not stored by nemu");
  });

  test("is English only; other locales fall back to it", () => {
    expect("privacy" in zh).toBe(false);
    expect("privacy" in ja).toBe(false);
  });
});
