import { describe, expect, test } from "bun:test";
import {
  MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_INPUT_CHARACTERS,
  MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_RESPONSE_BYTES,
  MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SEGMENTS,
  MobileJapaneseLearningNormalizeCache,
  assertMobileJapaneseLearningGrammarInputLength,
  assertMobileJapaneseLearningGrammarResponseByteLength,
  convertMobileIchiranSegments,
  makeMobileJapaneseLearningNormalizeCacheKey,
  runMobileJapaneseLearningGrammar,
  serializeMobileGrammarTokens,
} from "./mobileJapaneseLearningGrammar";

describe("mobile Japanese Learning grammar", () => {
  test("keeps normalized reading text private to one profile cache", () => {
    const first = makeMobileJapaneseLearningNormalizeCacheKey(
      "田中さん",
      "profile:account-a",
    );
    const second = makeMobileJapaneseLearningNormalizeCacheKey(
      "田中さん",
      "profile:account-b",
    );

    expect(first).not.toBe(second);
    expect(first).not.toContain("田中さん");
    expect(first).toMatch(/^normalize:profile:account-a:[a-f0-9]{64}$/);
    expect(
      makeMobileJapaneseLearningNormalizeCacheKey(
        "あ".repeat(4_097),
        "profile:account-a",
      ),
    ).toBeNull();
  });

  test("a late A normalization after clear cannot become a B cache hit", () => {
    const cache = new MobileJapaneseLearningNormalizeCache();
    const resultA = { normalized: "田中さん", properNouns: ["田中"] };

    cache.set("田中さん", resultA, "profile:account-a");
    cache.clear();
    // Simulate an A request that settled after the profile transition cleared
    // memory. Its immutable captured scope still writes only into A.
    cache.set("田中さん", resultA, "profile:account-a");

    expect(cache.get("田中さん", "profile:account-b")).toBeNull();
    expect(cache.get("田中さん", "profile:account-a")).toEqual(resultA);
  });

  test("accepts exact grammar limits and rejects the next item", () => {
    expect(() =>
      assertMobileJapaneseLearningGrammarInputLength(
        MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_INPUT_CHARACTERS,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningGrammarInputLength(
        MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_INPUT_CHARACTERS + 1,
      ),
    ).toThrow("safety limit");
    expect(() =>
      assertMobileJapaneseLearningGrammarResponseByteLength(
        MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_RESPONSE_BYTES,
      ),
    ).not.toThrow();
    expect(() =>
      assertMobileJapaneseLearningGrammarResponseByteLength(
        MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_RESPONSE_BYTES + 1,
      ),
    ).toThrow("safety limit");

    const exactSegments = Array.from(
      { length: MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SEGMENTS },
      () => "。",
    );
    expect(convertMobileIchiranSegments(exactSegments)).toHaveLength(
      MOBILE_JAPANESE_LEARNING_GRAMMAR_MAX_SEGMENTS,
    );
    expect(() =>
      convertMobileIchiranSegments([...exactSegments, "。"]),
    ).toThrow("safety limit");
  });

  test("converts Ichiran segments into mobile grammar tokens", () => {
    const tokens = convertMobileIchiranSegments([
      [
        [
          [
            [
              "watashi",
              {
                type: "KANJI",
                text: "私",
                kana: "わたし",
                gloss: [{ pos: "n", gloss: "I; me", info: "pronoun-like" }],
              },
              [],
            ],
          ],
          100,
        ],
      ],
      "。",
    ]);

    expect(tokens).toMatchObject([
      {
        word: "私",
        reading: "わたし",
        partOfSpeech: "Noun",
        meanings: [
          {
            text: "I; me",
            partOfSpeech: ["Noun"],
            info: "pronoun-like",
          },
        ],
      },
      {
        word: "。",
        reading: "",
        partOfSpeech: "Punctuation",
      },
    ]);
  });

  test("normalizes Ichiran fields without String.prototype.replaceAll", () => {
    const [token] = convertMobileIchiranSegments([
      [
        [
          [
            [
              "watashi",
              {
                type: "KANJI",
                text: "私",
                kana: "\fわたし\f",
                gloss: [{ pos: "[n]", gloss: "I; me" }],
              },
              [],
            ],
          ],
          100,
        ],
      ],
    ]);

    expect(token).toMatchObject({
      reading: "わたし",
      partOfSpeech: "Noun",
      meanings: [{ partOfSpeech: ["Noun"] }],
    });
  });

  test("normalizes text and posts boosted proper nouns to Ichiran", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        Response.json({
          segments: [
            [
              [
                [
                  [
                    "tanaka",
                    {
                      type: "KANJI",
                      text: "田中",
                      kana: "たなか",
                      gloss: [{ pos: "n", gloss: "Tanaka" }],
                    },
                    [],
                  ],
                ],
                100,
              ],
            ],
          ],
        }),
      );
    }) as typeof fetch;

    const result = await runMobileJapaneseLearningGrammar("  田中さん  ", {
      fetchImpl,
      ichiranApiBase: "https://ichiran.example/",
      normalizeText: async () => ({
        normalized: "田中さん",
        properNouns: ["田中"],
      }),
    });

    expect(requests[0]?.url).toBe("https://ichiran.example/api/segment");
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      text: "田中さん",
      limit: 5,
      entities: [{ start: 0, end: 2, boost: 1000 }],
    });
    expect(result).toMatchObject({
      originalText: "田中さん",
      normalizedText: "田中さん",
      tokens: [{ word: "田中", reading: "たなか" }],
    });
  });

  test("keeps components, conjugations, and alternatives for token details", () => {
    const [token] = convertMobileIchiranSegments([
      [
        [
          [
            [
              "tabeta",
              {
                type: "KANJI",
                text: "食べた",
                kana: "たべた",
                gloss: [{ pos: "v1", gloss: "ate" }],
                compound: ["食べ", "た"],
                components: [
                  {
                    type: "KANJI",
                    text: "食べ",
                    kana: "たべ",
                    gloss: [{ pos: "v1", gloss: "eat" }],
                  },
                  {
                    type: "KANA",
                    text: "た",
                    gloss: [{ pos: "aux-v", gloss: "past marker" }],
                  },
                ],
                conj: [
                  {
                    reading: "食べる【たべる】",
                    prop: [{ type: "past", pos: "v1" }],
                    gloss: [{ pos: "v1", gloss: "to eat" }],
                  },
                ],
                alternative: [
                  {
                    type: "KANJI",
                    text: "喰べた",
                    kana: "たべた",
                    gloss: [{ pos: "v1", gloss: "ate" }],
                  },
                ],
              },
              [],
            ],
          ],
          100,
        ],
      ],
    ]);

    expect(token).toMatchObject({
      word: "食べた",
      components: [{ word: "食べ", reading: "たべ" }, { word: "た" }],
      conjugationTypes: ["past"],
      conjugations: [
        {
          word: "食べる",
          reading: "たべる",
          partOfSpeech: "Ichidan Verb (-ru)",
          meanings: [{ text: "to eat" }],
        },
      ],
      alternatives: [{ word: "喰べた", reading: "たべた" }],
    });
  });

  test("serializes mobile grammar tokens for Nemu Chat context", () => {
    expect(
      serializeMobileGrammarTokens([
        {
          word: "私",
          reading: "わたし",
          partOfSpeech: "Noun",
          meanings: [{ text: "I; me", partOfSpeech: ["Noun"], info: "" }],
          conjugations: [],
          alternatives: [],
          components: [],
        },
        {
          word: "食べた",
          reading: "たべた",
          partOfSpeech: "Ichidan Verb (-ru)",
          meanings: [{ text: "to eat", partOfSpeech: ["Verb"], info: "" }],
          conjugationTypes: ["past"],
          conjugations: [],
          alternatives: [],
          components: [],
        },
      ]),
    ).toBe(
      "私【わたし】 (Noun) = I; me\n食べた【たべた】 (Ichidan Verb (-ru)) = to eat [past]",
    );
  });

  test("returns an empty result for blank text", async () => {
    const result = await runMobileJapaneseLearningGrammar("   ", {
      fetchImpl: (() => {
        throw new Error("unexpected fetch");
      }) as unknown as typeof fetch,
    });

    expect(result).toEqual({
      originalText: "",
      normalizedText: "",
      tokens: [],
    });
  });

  test("cancels an in-flight Ichiran request through the caller signal", async () => {
    const controller = new AbortController();
    let requestSignal: AbortSignal | null = null;
    let markFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      markFetchStarted = resolve;
    });
    const fetchImpl = ((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal;
      markFetchStarted();
      return new Promise<Response>(() => undefined);
    }) as typeof fetch;
    const pending = runMobileJapaneseLearningGrammar("日本語", {
      fetchImpl,
      normalizeText: async (value) => ({ normalized: value, properNouns: [] }),
      signal: controller.signal,
    });
    const rejection = pending.catch((error: unknown) => error);

    await fetchStarted;
    controller.abort(new Error("cancel grammar"));

    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("cancel grammar");
  });
});
