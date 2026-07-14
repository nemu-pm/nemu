import { describe, expect, test } from "bun:test";
import type { InstalledSource } from "@/data/schema";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  buildMobileWelcomeInstalledSourceKeySet,
  canRunMobileWelcomePrimaryAction,
  canRunMobileWelcomeSkipAction,
  canSelectMobileWelcomeLanguageOption,
  getMobileWelcomeAvailableSources,
  getMobileWelcomeDefaultSelection,
  getMobileWelcomeRecommendedSources,
  mobileWelcomeSourceKey,
  shouldScrollMobileWelcomeContent,
  shouldBlockMobileWelcomeUnderlyingContent,
} from "./mobileWelcome";

function source(registryId: string, id: string, name = id): MobileRegistrySource {
  return {
    id,
    registryId,
    registryName: registryId,
    name,
    version: 1,
  };
}

function installedSource(
  id: string,
  overrides: Partial<InstalledSource> = {},
): InstalledSource {
  return {
    id,
    registryId: "aidoku-community",
    version: 1,
    ...overrides,
  };
}

describe("mobile welcome helpers", () => {
  test("keeps every native onboarding step reachable at large text sizes", () => {
    for (const step of ["welcome", "language", "sources", "done"] as const) {
      expect(shouldScrollMobileWelcomeContent({ platform: "android", step })).toBe(true);
      expect(shouldScrollMobileWelcomeContent({ platform: "ios", step })).toBe(true);
    }
    expect(
      shouldScrollMobileWelcomeContent({ platform: "web", step: "welcome" }),
    ).toBe(false);
    expect(
      shouldScrollMobileWelcomeContent({ platform: "web", step: "sources" }),
    ).toBe(true);
  });

  test("hides the underlying navigation tree only while onboarding is visible", () => {
    expect(
      shouldBlockMobileWelcomeUnderlyingContent({ checking: true, visible: false }),
    ).toBe(false);
    expect(
      shouldBlockMobileWelcomeUnderlyingContent({ checking: false, visible: true }),
    ).toBe(true);
    expect(
      shouldBlockMobileWelcomeUnderlyingContent({ checking: false, visible: false }),
    ).toBe(false);
  });

  test("matches web recommended source order by app language", () => {
    expect(getMobileWelcomeRecommendedSources("en").map(mobileWelcomeSourceKey)).toEqual([
      "aidoku-community:multi.mangaplus",
      "aidoku-community:multi.mangadex",
      "aidoku-community:ja.shonenjumpplus",
    ]);
    expect(getMobileWelcomeRecommendedSources("zh").map(mobileWelcomeSourceKey)).toEqual([
      "aidoku-zh:zh.manhuaren",
      "aidoku-community:zh.copymanga",
      "aidoku-community:ja.shonenjumpplus",
    ]);
    expect(getMobileWelcomeRecommendedSources("ja").map(mobileWelcomeSourceKey)[0]).toBe(
      "aidoku-community:ja.shonenjumpplus"
    );
  });

  test("keeps only available recommended sources for the install list", () => {
    const available = [
      source("aidoku-community", "multi.mangadex", "MangaDex"),
      source("aidoku-community", "ja.shonenjumpplus", "Shonen Jump+"),
      source("other", "source"),
    ];

    expect(getMobileWelcomeAvailableSources("en", available).map((item) => item.name)).toEqual([
      "MangaDex",
      "Shonen Jump+",
    ]);
  });

  test("defaults to available recommendations when registries have loaded", () => {
    expect(
      getMobileWelcomeDefaultSelection("en", [
        source("aidoku-community", "multi.mangadex"),
      ])
    ).toEqual(["aidoku-community:multi.mangadex"]);

    expect(getMobileWelcomeDefaultSelection("en", [])).toEqual([
      "aidoku-community:multi.mangaplus",
      "aidoku-community:multi.mangadex",
      "aidoku-community:ja.shonenjumpplus",
    ]);
  });

  test("marks recommended sources installed across stored source aliases", () => {
    const keys = buildMobileWelcomeInstalledSourceKeySet([
      installedSource("en.legacy", { sourceId: "manifest.id" }),
      installedSource("aidoku-community:registry-id", {
        sourceId: "runtime.id",
      }),
    ]);

    expect(keys.has("aidoku-community:en.legacy")).toBe(true);
    expect(keys.has("aidoku-community:registry-id")).toBe(true);
    expect(keys.has("aidoku-community:runtime.id")).toBe(true);
  });

  test("gates welcome actions while native work is running", () => {
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "welcome",
        installing: false,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(true);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "sources",
        installing: false,
        completing: false,
        changingLanguage: false,
        sourcesLoading: true,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "sources",
        installing: true,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "done",
        installing: true,
        completing: false,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "done",
        installing: false,
        completing: true,
        changingLanguage: false,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomePrimaryAction({
        step: "language",
        installing: false,
        completing: false,
        changingLanguage: true,
        sourcesLoading: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: false,
        changingLanguage: false,
      }),
    ).toBe(true);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: true,
        completing: false,
        changingLanguage: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: true,
        changingLanguage: false,
      }),
    ).toBe(false);
    expect(
      canRunMobileWelcomeSkipAction({
        installing: false,
        completing: false,
        changingLanguage: true,
      }),
    ).toBe(false);
  });

  test("gates selected welcome language options as no-op selections", () => {
    expect(
      canSelectMobileWelcomeLanguageOption({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileWelcomeLanguageOption({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileWelcomeLanguageOption({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });
});
