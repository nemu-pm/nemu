import { describe, expect, test } from "bun:test";
import {
  MOBILE_METADATA_MATCH_FIELD_ORDER,
  applyMobileMetadataMatchToForm,
  applyMobileMetadataMatchToFormWithDescription,
  canRunMobileMetadataMatchSearch,
  findMobileChineseTitleFallback,
  findMobileJapaneseTitleFallback,
  findMobileLocalizedDescription,
  getMobileMetadataMatchFieldAvailability,
  isMobileMetadataExactTitleMatch,
  localizeMobileMetadataMatch,
  localizeMobileMetadataMatchWithAiLocalization,
  localizeMobileMetadataMatchWithDescription,
  mapAniListMatch,
  mapJikanMatch,
  mapMangaUpdatesMatch,
  searchMobileMetadataMatches,
  searchMobileMetadataSmartMatches,
  selectMobileMetadataMatchResultsForDisplay,
  type MobileMetadataMatchProvider,
  type MobileMetadataMatchResult,
} from "./mobileMetadataMatch";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function matchResult(
  provider: MobileMetadataMatchProvider,
  externalId: number
): MobileMetadataMatchResult {
  return {
    provider,
    providerLabel:
      provider === "anilist"
        ? "AniList"
        : provider === "mal"
          ? "MyAnimeList"
          : "MangaUpdates",
    externalId,
    title: `${provider}-${externalId}`,
    metadata: { title: `${provider}-${externalId}` },
    externalIds:
      provider === "anilist"
        ? { aniList: externalId }
        : provider === "mal"
          ? { mal: externalId }
          : { mangaUpdates: externalId },
    alternativeTitles: [`${provider}-${externalId}`],
  };
}

describe("mobile metadata match", () => {
  test("orders match fields like the web smart match merge UI", () => {
    expect(MOBILE_METADATA_MATCH_FIELD_ORDER).toEqual([
      "cover",
      "title",
      "status",
      "authors",
      "description",
      "tags",
    ]);
  });

  test("enables smart match search only when an effective query can run", () => {
    expect(canRunMobileMetadataMatchSearch("Frieren", "", false)).toBe(true);
    expect(canRunMobileMetadataMatchSearch("   ", "Frieren", false)).toBe(true);
    expect(canRunMobileMetadataMatchSearch("   ", "   ", false)).toBe(false);
    expect(canRunMobileMetadataMatchSearch("Frieren", "", true)).toBe(false);
  });

  test("selects metadata match results with the web per-provider limit", () => {
    const results = [
      ...Array.from({ length: 12 }, (_, index) =>
        matchResult("anilist", index + 1)
      ),
      ...Array.from({ length: 3 }, (_, index) =>
        matchResult("mal", index + 1)
      ),
    ];

    expect(
      selectMobileMetadataMatchResultsForDisplay(results).map(
        (result) => `${result.provider}:${result.externalId}`
      )
    ).toEqual([
      "anilist:1",
      "anilist:2",
      "anilist:3",
      "anilist:4",
      "anilist:5",
      "anilist:6",
      "anilist:7",
      "anilist:8",
      "anilist:9",
      "anilist:10",
      "mal:1",
      "mal:2",
      "mal:3",
    ]);
  });

  test("keeps later provider metadata matches reachable after an earlier provider fills the list", () => {
    const results = [
      ...Array.from({ length: 11 }, (_, index) =>
        matchResult("anilist", index + 1)
      ),
      matchResult("mangaupdates", 1),
    ];

    expect(
      selectMobileMetadataMatchResultsForDisplay(results).at(-1)
    ).toMatchObject({
      provider: "mangaupdates",
      externalId: 1,
    });
  });

  test("maps AniList media into editable metadata and external IDs", () => {
    const result = mapAniListMatch({
      id: 101,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
      description: "A mage returns.<br>After the journey.",
      coverImage: { extraLarge: "https://img.test/frieren.jpg" },
      genres: ["Adventure", "Drama"],
      tags: [{ name: "Magic", rank: 90 }],
      status: "RELEASING",
      synonyms: ["Frieren"],
      siteUrl: "https://anilist.co/manga/101",
      staff: {
        edges: [
          {
            role: "Story & Art",
            node: { name: { full: "Yamada Kanehito", native: "山田鐘人" } },
          },
          { role: "Assistant", node: { name: { full: "Ignored Person" } } },
        ],
      },
    });

    expect(result).toMatchObject({
      provider: "anilist",
      providerLabel: "AniList",
      externalId: 101,
      externalIds: { aniList: 101 },
      metadata: {
        title: "Sousou no Frieren",
        cover: "https://img.test/frieren.jpg",
        authors: ["Yamada Kanehito"],
        description: "A mage returns.\nAfter the journey.",
        tags: ["Adventure", "Drama", "Magic"],
        status: 1,
      },
    });
    expect(result.alternativeTitles).toContain("葬送のフリーレン");
    expect(result.localizationData?.alStaff).toContainEqual({
      role: "Story & Art",
      native: "山田鐘人",
    });
  });

  test("maps MAL and MangaUpdates provider statuses", () => {
    expect(
      mapJikanMatch({
        mal_id: 2,
        title: "Akira",
        status: "Finished",
        synopsis: "Neo Tokyo.",
        images: { webp: { large_image_url: "https://img.test/akira.webp" } },
        authors: [{ mal_id: 9, name: "Katsuhiro Otomo" }],
        genres: [{ name: "Sci-Fi" }],
      }).metadata.status
    ).toBe(2);

    expect(
      mapMangaUpdatesMatch({
        series_id: 3,
        title: "Nana",
        url: "https://www.mangaupdates.com/series/3",
        status: "On Hiatus",
        authors: [{ name: "Ai Yazawa" }],
        genres: [{ genre: "Drama" }],
      }).metadata.status
    ).toBe(4);
  });

  test("applies metadata match fields into the editable form", () => {
    const result = mapAniListMatch({
      id: 101,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
      },
      description: "A mage returns.",
      coverImage: { large: "https://img.test/frieren.jpg" },
      genres: ["Adventure"],
      status: "RELEASING",
      staff: {
        edges: [
          { role: "Story", node: { name: { full: "Yamada Kanehito" } } },
        ],
      },
    });
    const form = {
      title: "Current Title",
      authorsText: "Current Author",
      description: "Current description",
      tagsText: "Current Tag",
      coverUrl: "https://img.test/current.jpg",
      status: 0,
      externalIds: { mal: 9 },
    };

    expect(getMobileMetadataMatchFieldAvailability(result)).toEqual({
      title: true,
      cover: true,
      authors: true,
      status: true,
      tags: true,
      description: true,
    });
    expect(applyMobileMetadataMatchToForm(form, result, ["title"])).toEqual({
      ...form,
      title: "Sousou no Frieren",
      externalIds: { mal: 9, aniList: 101 },
    });
    expect(applyMobileMetadataMatchToForm(form, result)).toEqual({
      title: "Sousou no Frieren",
      authorsText: "Yamada Kanehito",
      description: "A mage returns.",
      tagsText: "Adventure",
      coverUrl: "https://img.test/frieren.jpg",
      status: 1,
      externalIds: { mal: 9, aniList: 101 },
    });
  });

  test("localizes metadata match titles and tags for mobile apply", () => {
    const result = mapAniListMatch({
      id: 102,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
      genres: ["Adventure"],
      tags: [{ name: "Magic", rank: 90 }],
      staff: {
        edges: [
          {
            role: "Story",
            node: { name: { full: "Yamada Kanehito", native: "山田鐘人" } },
          },
          {
            role: "Assistant",
            node: { name: { full: "Ignored Person", native: "無視する人" } },
          },
        ],
      },
    });
    const form = {
      title: "Current Title",
      authorsText: "",
      description: "",
      tagsText: "",
      coverUrl: "",
      status: 0,
      externalIds: undefined,
    };

    expect(localizeMobileMetadataMatch(result, "ja").metadata).toMatchObject({
      title: "葬送のフリーレン",
      authors: ["山田鐘人"],
      tags: ["冒険", "魔法"],
    });
    expect(
      applyMobileMetadataMatchToForm(form, result, ["title", "authors", "tags"], {
        metadataLanguage: "zh",
      })
    ).toMatchObject({
      title: "Sousou no Frieren",
      authorsText: "山田鐘人",
      tagsText: "冒险, 魔法",
      externalIds: { aniList: 102 },
    });
  });

  test("localizes metadata match descriptions through optional AI actions", async () => {
    const result = mapAniListMatch({
      id: 103,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
      description: "The mage Frieren looks back on her journey.",
    });
    const calls: Array<{ action: unknown; args: unknown }> = [];
    const client = {
      async action(action: unknown, args: unknown) {
        calls.push({ action, args });
        return calls.length === 1
          ? "勇者一行の旅路を振り返る物語。"
          : "讲述魔法使芙莉莲回望旅程的故事。";
      },
    };

    await expect(findMobileLocalizedDescription(result, "ja", client)).resolves.toBe(
      "勇者一行の旅路を振り返る物語。"
    );
    expect(calls[0]?.args).toEqual({
      japaneseTitle: "葬送のフリーレン",
      romajiTitle: "Sousou no Frieren",
    });

    const localized = await localizeMobileMetadataMatchWithDescription(
      result,
      "zh",
      client
    );
    expect(localized.metadata.description).toBe(
      "讲述魔法使芙莉莲回望旅程的故事。"
    );
    expect(calls[1]?.args).toEqual({
      japaneseTitle: "葬送のフリーレン",
      englishTitle: "Frieren: Beyond Journey's End",
    });
  });

  test("finds Chinese title fallback through optional AI action client", async () => {
    const result = mapAniListMatch({
      id: 105,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
    });
    const calls: Array<{ action: unknown; args: unknown }> = [];
    const client = {
      async action(action: unknown, args: unknown) {
        calls.push({ action, args });
        return {
          simplified: "葬送的芙莉莲",
          traditional: "葬送的芙莉蓮",
        };
      },
    };

    await expect(findMobileChineseTitleFallback(result, client)).resolves.toBe(
      "葬送的芙莉莲"
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({
      japaneseTitle: "葬送のフリーレン",
      englishTitle: "Frieren: Beyond Journey's End",
    });
  });

  test("applies Chinese title fallback only when the title field needs it", async () => {
    const result = mapAniListMatch({
      id: 106,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
      description: "The mage Frieren looks back on her journey.",
      genres: ["Adventure"],
    });
    const form = {
      title: "Current Title",
      authorsText: "",
      description: "",
      tagsText: "",
      coverUrl: "",
      status: 0,
      externalIds: undefined,
    };
    const titleCalls: unknown[] = [];
    const descriptionCalls: unknown[] = [];
    const chineseTitleClient = {
      async action(_action: unknown, args: unknown) {
        titleCalls.push(args);
        return { simplified: "葬送的芙莉莲", traditional: null };
      },
    };
    const descriptionClient = {
      async action(_action: unknown, args: unknown) {
        descriptionCalls.push(args);
        return "讲述魔法使芙莉莲回望旅程的故事。";
      },
    };

    await expect(
      applyMobileMetadataMatchToFormWithDescription(form, result, ["title"], {
        metadataLanguage: "zh",
        chineseTitleClient,
        descriptionClient,
      })
    ).resolves.toMatchObject({
      title: "葬送的芙莉莲",
      description: "",
    });
    expect(titleCalls).toHaveLength(1);
    expect(descriptionCalls).toHaveLength(0);

    titleCalls.length = 0;
    await expect(
      applyMobileMetadataMatchToFormWithDescription(form, result, ["description"], {
        metadataLanguage: "zh",
        chineseTitleClient,
        descriptionClient,
      })
    ).resolves.toMatchObject({
      title: "Current Title",
      description: "讲述魔法使芙莉莲回望旅程的故事。",
    });
    expect(titleCalls).toHaveLength(0);
    expect(descriptionCalls).toHaveLength(1);
  });

  test("keeps provider Chinese titles ahead of AI fallback", async () => {
    const result = mapAniListMatch({
      id: 107,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
      synonyms: ["葬送的芙莉莲"],
    });
    const calls: unknown[] = [];
    const client = {
      async action(_action: unknown, args: unknown) {
        calls.push(args);
        return { simplified: "AI should not be used", traditional: null };
      },
    };

    await expect(findMobileChineseTitleFallback(result, client)).resolves.toBeNull();

    const localized = await localizeMobileMetadataMatchWithAiLocalization(
      result,
      "zh",
      {
        chineseTitleClient: client,
        includeChineseTitle: true,
        includeDescription: false,
      }
    );
    expect(localized.metadata.title).toBe("葬送的芙莉莲");
    expect(calls).toHaveLength(0);
  });

  test("applies localized descriptions only when the description field is selected", async () => {
    const result = mapJikanMatch({
      mal_id: 104,
      title: "Blue Lock",
      title_english: "Blue Lock",
      title_japanese: "ブルーロック",
      synopsis: "Strikers compete.",
      images: {},
    });
    const form = {
      title: "Current Title",
      authorsText: "",
      description: "",
      tagsText: "",
      coverUrl: "",
      status: 0,
      externalIds: undefined,
    };
    const client = {
      async action(_action: unknown, args: unknown) {
        expect(args).toEqual({
          japaneseTitle: "ブルーロック",
          romajiTitle: "Blue Lock",
        });
        return "ストライカーたちが競い合う。";
      },
    };

    await expect(
      applyMobileMetadataMatchToFormWithDescription(form, result, ["title"], {
        metadataLanguage: "ja",
        descriptionClient: client,
      })
    ).resolves.toMatchObject({
      title: "ブルーロック",
      description: "",
    });

    await expect(
      applyMobileMetadataMatchToFormWithDescription(form, result, ["description"], {
        metadataLanguage: "ja",
        descriptionClient: client,
      })
    ).resolves.toMatchObject({
      title: "Current Title",
      description: "ストライカーたちが競い合う。",
    });
  });

  test("detects exact title matches before using provider aliases", () => {
    const result = mapAniListMatch({
      id: 101,
      title: {
        romaji: "Sousou no Frieren",
        english: "Frieren: Beyond Journey's End",
        native: "葬送のフリーレン",
      },
      synonyms: ["Frieren"],
    });

    expect(isMobileMetadataExactTitleMatch("Frieren", result)).toBe(true);
    expect(isMobileMetadataExactTitleMatch("Fri", result)).toBe(false);
  });

  test("finds Japanese title fallback through an optional Convex action client", async () => {
    const calls: unknown[] = [];
    const client = {
      async action(action: unknown, args: { title: string; authors?: string[] }) {
        calls.push({ action, args });
        return "ブルーロック";
      },
    };

    await expect(
      findMobileJapaneseTitleFallback(" Blue Lock ", ["Kaneshiro"], client)
    ).resolves.toBe("ブルーロック");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      args: { title: "Blue Lock", authors: ["Kaneshiro"] },
    });
  });

  test("skips Japanese title fallback when unavailable or failed", async () => {
    await expect(
      findMobileJapaneseTitleFallback("Blue Lock", undefined, null)
    ).resolves.toBeNull();
    await expect(
      findMobileJapaneseTitleFallback("Blue Lock", undefined, {
        async action() {
          throw new Error("offline");
        },
      })
    ).resolves.toBeNull();
  });

  test("searches configured providers and keeps partial failures non-fatal", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://graphql.anilist.co") {
        return jsonResponse({
          data: {
            Page: {
              media: [
                {
                  id: 1,
                  title: { romaji: "One Piece", english: "One Piece" },
                  status: "RELEASING",
                  synonyms: [],
                },
              ],
            },
          },
        });
      }

      if (url.startsWith("https://api.jikan.moe/v4/manga?")) {
        return jsonResponse({ data: [] }, 500);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const search = await searchMobileMetadataMatches("One Piece", {
      providers: ["anilist", "mal"],
      fetcher,
    });

    expect(calls).toEqual([
      "https://graphql.anilist.co",
      "https://api.jikan.moe/v4/manga?q=One+Piece&limit=10",
    ]);
    expect(search.results.map((result) => result.provider)).toEqual(["anilist"]);
    expect(search.errors).toEqual({});
  });

  test("smart metadata search retries missing providers with a canonical exact-match title", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://graphql.anilist.co") {
        return jsonResponse({
          data: {
            Page: {
              media: [
                {
                  id: 101,
                  title: { romaji: "Sousou no Frieren", english: "Frieren" },
                  synonyms: [],
                },
              ],
            },
          },
        });
      }

      if (
        url === "https://api.jikan.moe/v4/manga?q=Frieren&limit=10"
      ) {
        return jsonResponse({ data: [] });
      }

      if (
        url ===
        "https://api.jikan.moe/v4/manga?q=Sousou+no+Frieren&limit=10"
      ) {
        return jsonResponse({
          data: [
            {
              mal_id: 202,
              title: "Sousou no Frieren",
              title_english: "Frieren",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const search = await searchMobileMetadataSmartMatches("Frieren", {
      providers: ["anilist", "mal"],
      fetcher,
    });

    expect(calls).toEqual([
      "https://graphql.anilist.co",
      "https://api.jikan.moe/v4/manga?q=Frieren&limit=10",
      "https://api.jikan.moe/v4/manga?q=Sousou+no+Frieren&limit=10",
    ]);
    expect(search.query).toBe("Sousou no Frieren");
    expect(search.exactMatches.map((result) => result.provider)).toEqual([
      "anilist",
      "mal",
    ]);
    expect(search.results.map((result) => result.provider)).toContain("mal");
  });

  test("smart metadata search retries with AI Japanese title fallback", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url === "https://graphql.anilist.co") {
        return jsonResponse({
          data: {
            Page: {
              media: [
                {
                  id: 303,
                  title: {
                    romaji: calls.length === 1 ? "Unrelated" : "Blue Lock",
                    native: calls.length === 1 ? "別作品" : "ブルーロック",
                  },
                  synonyms: [],
                },
              ],
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const search = await searchMobileMetadataSmartMatches("Blue Lock", {
      providers: ["anilist"],
      fetcher,
      japaneseTitleClient: {
        async action(_action, args) {
          expect(args).toEqual({ title: "Blue Lock", authors: ["Kaneshiro"] });
          return "ブルーロック";
        },
      },
      authors: ["Kaneshiro"],
    });

    expect(calls).toEqual([
      "https://graphql.anilist.co",
      "https://graphql.anilist.co",
    ]);
    expect(search.query).toBe("ブルーロック");
    expect(search.fallbackTitle).toBe("ブルーロック");
    expect(search.exactMatches).toHaveLength(1);
    expect(search.exactMatches[0]).toMatchObject({
      provider: "anilist",
      title: "Blue Lock",
    });
  });

  test("falls back across MangaUpdates proxy candidates", async () => {
    const calls: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      if (url.startsWith("https://convex.test/proxy?url=")) {
        throw new Error("proxy unavailable");
      }

      if (url.startsWith("https://service.nemu.pm/proxy?url=")) {
        const proxied = decodeURIComponent(url.split("url=")[1] ?? "");
        if (proxied.endsWith("/series/search")) {
          return jsonResponse({
            results: [{ record: { series_id: 77, title: "Yotsuba&!", url: "https://mu.test/77" } }],
          });
        }
        if (proxied.endsWith("/series/77")) {
          return jsonResponse({
            series_id: 77,
            title: "Yotsuba&!",
            url: "https://mu.test/77",
            status: "Complete",
            associated: [{ title: "Yotsubato!" }],
          });
        }
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    const search = await searchMobileMetadataMatches("Yotsuba", {
      providers: ["mangaupdates"],
      fetcher,
      forceMangaUpdatesProxy: true,
      convexSiteUrl: "https://convex.test",
      mangaUpdatesMaxResults: 1,
    });

    expect(calls).toEqual([
      "https://convex.test/proxy?url=https%3A%2F%2Fapi.mangaupdates.com%2Fv1%2Fseries%2Fsearch",
      "https://service.nemu.pm/proxy?url=https%3A%2F%2Fapi.mangaupdates.com%2Fv1%2Fseries%2Fsearch",
      "https://convex.test/proxy?url=https%3A%2F%2Fapi.mangaupdates.com%2Fv1%2Fseries%2F77",
      "https://service.nemu.pm/proxy?url=https%3A%2F%2Fapi.mangaupdates.com%2Fv1%2Fseries%2F77",
    ]);
    expect(search.results).toHaveLength(1);
    expect(search.results[0]).toMatchObject({
      provider: "mangaupdates",
      externalIds: { mangaUpdates: 77 },
      metadata: { status: 2 },
    });
  });
});
