import { describe, expect, test } from "bun:test";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";

describe("sync clock recovery guidance", () => {
  test("ships actionable date/time and reload copy in every supported locale", () => {
    for (const locale of [en, ja, zh]) {
      expect(locale.sync.clockInvalid.title.length).toBeGreaterThan(0);
      expect(locale.sync.clockInvalid.description.length).toBeGreaterThan(20);
      expect(locale.sync.clockInvalid.reload.length).toBeGreaterThan(0);
    }
    expect(en.sync.clockInvalid.description).toContain("automatic date");
    expect(en.sync.clockInvalid.description).toContain("reload");
  });
});
