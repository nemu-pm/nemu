import { describe, expect, test } from "bun:test";
import type { InstalledSource, LocalSourceLink } from "@/data/schema";
import {
  buildMobileDualReadRouteParams,
  buildMobileDualReadTargets,
  getMobileDualReadCandidateSources,
  getMobileDualReadDisplaySources,
  getMobileDualReadSourcePresentation,
  pickDefaultMobileDualReadSecondary,
  pickMobileDualReadChapter,
  type MobileDualReadChapterResolution,
} from "./mobileReaderPluginRuntime";
import { getMobileStrings } from "./mobileI18n";

function source(overrides: Partial<LocalSourceLink>): LocalSourceLink {
  return {
    id: overrides.id ?? "source-a",
    libraryItemId: "item-1",
    registryId: overrides.registryId ?? "registry",
    sourceId: overrides.sourceId ?? "source",
    sourceMangaId: overrides.sourceMangaId ?? "manga",
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function installedSource(overrides: Partial<InstalledSource> = {}): InstalledSource {
  return {
    id: "aidoku-community:registry-id",
    registryId: "aidoku-community",
    sourceId: "manifest.id",
    version: 1,
    ...overrides,
  };
}

describe("mobile reader plugin runtime", () => {
  const strings = getMobileStrings("en");

  test("keeps the current reader chapter for the selected source", () => {
    const selected = source({ id: "a", sourceId: "alpha" });
    const targets = buildMobileDualReadTargets(
      [selected],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
    );

    expect(targets).toEqual([
      {
        source: selected,
        selected: true,
        status: "current",
        chapter: { id: "current-chapter", chapterNumber: 12 },
        label: "alpha",
        detail: "Current / Chapter 12",
      },
    ]);
  });

  test("uses latest known chapters for alternate sources", () => {
    const selected = source({ id: "a", sourceId: "alpha" });
    const alternate = source({
      id: "b",
      sourceId: "beta",
      latestChapter: { id: "latest", title: "Finale", chapterNumber: 99 },
    });
    const unavailable = source({ id: "c", sourceId: "gamma" });

    const targets = buildMobileDualReadTargets(
      [selected, alternate, unavailable],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
    );

    expect(targets.map((target) => ({
      label: target.label,
      selected: target.selected,
      status: target.status,
      chapterId: target.chapter?.id ?? null,
      detail: target.detail,
    }))).toEqual([
      {
        label: "alpha",
        selected: true,
        status: "current",
        chapterId: "current-chapter",
        detail: "Current / Chapter 12",
      },
      {
        label: "beta",
        selected: false,
        status: "ready",
        chapterId: "latest",
        detail: "Chapter 99",
      },
      {
        label: "gamma",
        selected: false,
        status: "blocked",
        chapterId: null,
        detail: "No chapter",
      },
    ]);
  });

  test("prefers a fetched alternate chapter that matches the current chapter number", () => {
    const result = pickMobileDualReadChapter({
      primaryChapter: { id: "primary-7", chapterNumber: 7 },
      primaryChapters: [
        { id: "primary-8", chapterNumber: 8 },
        { id: "primary-7", chapterNumber: 7 },
        { id: "primary-6", chapterNumber: 6 },
      ],
      secondaryChapters: [
        { id: "secondary-12", chapterNumber: 12 },
        { id: "secondary-7", chapterNumber: 7 },
        { id: "secondary-1", chapterNumber: 1 },
      ],
    });

    expect(result?.id).toBe("secondary-7");
  });

  test("falls back to title and chapter index when numbers are missing", () => {
    const result = pickMobileDualReadChapter({
      primaryChapter: { id: "primary-2", title: "A New Rival" },
      primaryChapters: [
        { id: "primary-1", title: "Opening" },
        { id: "primary-2", title: "A New Rival" },
        { id: "primary-3", title: "Final Match" },
      ],
      secondaryChapters: [
        { id: "secondary-1", title: "Opening" },
        { id: "secondary-2", title: "New Rival" },
        { id: "secondary-3", title: "Final Match" },
      ],
    });

    expect(result?.id).toBe("secondary-2");
  });

  test("uses resolved dual-read chapters before stale latest chapter metadata", () => {
    const selected = source({ id: "a", sourceId: "alpha" });
    const alternate = source({
      id: "b",
      sourceId: "beta",
      latestChapter: { id: "latest", chapterNumber: 99 },
    });
    const resolutions = new Map<string, MobileDualReadChapterResolution>([
      [
        "b",
        {
          status: "ready",
          chapter: { id: "matched", chapterNumber: 12 },
        },
      ],
    ]);

    const targets = buildMobileDualReadTargets(
      [selected, alternate],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
      resolutions,
    );

    expect(targets[1]?.chapter?.id).toBe("matched");
    expect(targets[1]?.status).toBe("ready");
    expect(targets[1]?.detail).toBe("Chapter 12");
  });

  test("uses installed source presentation metadata for dual-read targets", () => {
    const selected = source({ id: "a", sourceId: "alpha" });
    const alternate = source({
      id: "b",
      sourceId: "beta",
      latestChapter: { id: "latest", chapterNumber: 99 },
    });
    const presentations = new Map([
      [
        "b",
        {
          name: "Beta Scans",
          icon: "https://example.test/beta.png",
          language: "en",
        },
      ],
    ]);

    const targets = buildMobileDualReadTargets(
      [selected, alternate],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
      new Map(),
      presentations,
    );

    expect(targets[1]).toMatchObject({
      label: "Beta Scans",
      icon: "https://example.test/beta.png",
      language: "en",
    });
  });

  test("filters same-source duplicate links from dual-read candidates", () => {
    const selected = source({
      id: "a",
      registryId: "aidoku",
      sourceId: "alpha",
      sourceMangaId: "primary",
    });
    const sameSource = source({
      id: "a-duplicate",
      registryId: "aidoku",
      sourceId: "alpha",
      sourceMangaId: "alternate-title",
    });
    const alternate = source({
      id: "b",
      registryId: "aidoku",
      sourceId: "beta",
      sourceMangaId: "secondary",
    });

    expect(
      getMobileDualReadCandidateSources(
        [selected, sameSource, alternate],
        selected,
      ).map((item) => item.id),
    ).toEqual(["b"]);
    expect(
      getMobileDualReadDisplaySources(
        [sameSource, alternate, selected],
        selected,
      ).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });

  test("builds dual-read targets without same-source duplicate alternates", () => {
    const selected = source({
      id: "a",
      registryId: "aidoku",
      sourceId: "alpha",
      sourceMangaId: "primary",
    });
    const sameSource = source({
      id: "a-duplicate",
      registryId: "aidoku",
      sourceId: "alpha",
      sourceMangaId: "alternate-title",
      latestChapter: { id: "same-source-latest", chapterNumber: 99 },
    });
    const alternate = source({
      id: "b",
      registryId: "aidoku",
      sourceId: "beta",
      sourceMangaId: "secondary",
      latestChapter: { id: "secondary-latest", chapterNumber: 12 },
    });

    const targets = buildMobileDualReadTargets(
      [sameSource, alternate, selected],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
    );

    expect(targets.map((target) => target.source.id)).toEqual(["a", "b"]);
    expect(targets[1]?.chapter?.id).toBe("secondary-latest");
  });

  test("filters registry and runtime aliases from dual-read candidates", () => {
    const selected = source({
      id: "selected",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      sourceMangaId: "primary",
    });
    const sameRuntime = source({
      id: "same-runtime",
      registryId: "aidoku-community",
      sourceId: "registry-id",
      sourceMangaId: "alternate-title",
    });
    const alternate = source({
      id: "alternate",
      registryId: "aidoku-community",
      sourceId: "other-source",
      sourceMangaId: "secondary",
    });

    expect(
      getMobileDualReadCandidateSources(
        [selected, sameRuntime, alternate],
        selected,
        [installedSource()],
      ).map((item) => item.id),
    ).toEqual(["alternate"]);
    expect(
      getMobileDualReadDisplaySources(
        [sameRuntime, alternate, selected],
        selected,
        [installedSource()],
      ).map((item) => item.id),
    ).toEqual(["selected", "alternate"]);
  });

  test("builds dual-read targets without installed source alias alternates", () => {
    const selected = source({
      id: "selected",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      sourceMangaId: "primary",
    });
    const sameRuntime = source({
      id: "same-runtime",
      registryId: "aidoku-community",
      sourceId: "registry-id",
      sourceMangaId: "alternate-title",
      latestChapter: { id: "same-source-latest", chapterNumber: 99 },
    });
    const alternate = source({
      id: "alternate",
      registryId: "aidoku-community",
      sourceId: "other-source",
      sourceMangaId: "secondary",
      latestChapter: { id: "secondary-latest", chapterNumber: 12 },
    });

    const targets = buildMobileDualReadTargets(
      [sameRuntime, alternate, selected],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
      new Map(),
      new Map(),
      [installedSource()],
    );

    expect(targets.map((target) => target.source.id)).toEqual([
      "selected",
      "alternate",
    ]);
    expect(targets[1]?.chapter?.id).toBe("secondary-latest");
  });

  test("keeps unresolved dual-read targets disabled while matching", () => {
    const selected = source({ id: "a", sourceId: "alpha" });
    const alternate = source({
      id: "b",
      sourceId: "beta",
      latestChapter: { id: "latest", chapterNumber: 99 },
    });
    const resolutions = new Map<string, MobileDualReadChapterResolution>([
      [
        "b",
        {
          status: "loading",
          detail: "Matching chapters.",
        },
      ],
    ]);

    const targets = buildMobileDualReadTargets(
      [selected, alternate],
      selected,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
      resolutions,
    );

    expect(targets[1]?.chapter).toBeNull();
    expect(targets[1]?.status).toBe("loading");
    expect(targets[1]?.detail).toBe("Matching chapters.");
  });

  test("builds dual-read route params with the current source-order page", () => {
    const alternate = source({
      id: "b",
      registryId: "aidoku",
      sourceId: "beta",
      sourceMangaId: "blue-lock",
      latestChapter: { id: "chapter-12", chapterNumber: 12 },
    });
    const [target] = buildMobileDualReadTargets(
      [alternate],
      null,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
    );

    expect(target).toBeDefined();
    expect(buildMobileDualReadRouteParams(target!, 23)).toEqual({
      registryId: "aidoku",
      sourceId: "beta",
      mangaId: "blue-lock",
      chapterId: "chapter-12",
      page: "23",
    });
  });

  test("omits invalid page context from dual-read route params", () => {
    const alternate = source({
      id: "b",
      latestChapter: { id: "chapter-12", chapterNumber: 12 },
    });
    const [target] = buildMobileDualReadTargets(
      [alternate],
      null,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
    );

    expect(target).toBeDefined();
    expect(buildMobileDualReadRouteParams(target!, 0)).not.toHaveProperty("page");
  });

  test("does not build dual-read route params without a resolved chapter", () => {
    const unavailable = source({ id: "b" });
    const [target] = buildMobileDualReadTargets(
      [unavailable],
      null,
      { id: "current-chapter", chapterNumber: 12 },
      strings,
    );

    expect(target).toBeDefined();
    expect(buildMobileDualReadRouteParams(target!, 12)).toBeNull();
  });

  test("getMobileDualReadSourcePresentation derives name/icon/language from the matching installed source", () => {
    const link = source({ id: "a", registryId: "aidoku-community", sourceId: "src-a" });
    const installed = installedSource({
      id: "aidoku-community:src-a",
      registryId: "aidoku-community",
      sourceId: "src-a",
      name: "Source A",
      icon: "data:image/png;base64,AAA",
      languages: ["ja"],
    });

    expect(getMobileDualReadSourcePresentation(link, [installed])).toEqual({
      name: "Source A",
      icon: "data:image/png;base64,AAA",
      language: "ja",
    });
  });

  test("getMobileDualReadSourcePresentation returns sparse presentation when no installed source matches", () => {
    const link = source({ id: "a" });
    expect(getMobileDualReadSourcePresentation(link, [])).toEqual({});
  });

  test("pickDefaultMobileDualReadSecondary prefers a candidate whose language differs from the primary", () => {
    const primary = source({ id: "primary", registryId: "aidoku-community", sourceId: "src-p" });
    const sameLang = source({ id: "same-lang", registryId: "aidoku-community", sourceId: "src-s" });
    const diffLang = source({ id: "diff-lang", registryId: "aidoku-community", sourceId: "src-d" });
    const installed: InstalledSource[] = [
      installedSource({ id: "aidoku-community:src-p", sourceId: "src-p", languages: ["ja"] }),
      installedSource({ id: "aidoku-community:src-s", sourceId: "src-s", languages: ["ja"] }),
      installedSource({ id: "aidoku-community:src-d", sourceId: "src-d", languages: ["en"] }),
    ];

    const picked = pickDefaultMobileDualReadSecondary(primary, [sameLang, diffLang], installed);
    expect(picked?.id).toBe("diff-lang");
  });

  test("pickDefaultMobileDualReadSecondary falls back to the first candidate when all share the primary language", () => {
    const primary = source({ id: "primary", registryId: "aidoku-community", sourceId: "src-p" });
    const candidateA = source({ id: "a", registryId: "aidoku-community", sourceId: "src-a" });
    const candidateB = source({ id: "b", registryId: "aidoku-community", sourceId: "src-b" });
    const installed: InstalledSource[] = [
      installedSource({ id: "aidoku-community:src-p", sourceId: "src-p", languages: ["ja"] }),
      installedSource({ id: "aidoku-community:src-a", sourceId: "src-a", languages: ["ja"] }),
      installedSource({ id: "aidoku-community:src-b", sourceId: "src-b", languages: ["ja"] }),
    ];

    const picked = pickDefaultMobileDualReadSecondary(primary, [candidateA, candidateB], installed);
    expect(picked?.id).toBe("a");
  });

  test("pickDefaultMobileDualReadSecondary returns null without a primary or candidates", () => {
    expect(pickDefaultMobileDualReadSecondary(null, [source({ id: "a" })], [])).toBeNull();
    expect(
      pickDefaultMobileDualReadSecondary(source({ id: "primary" }), [], []),
    ).toBeNull();
  });
});
