import { describe, expect, test } from "bun:test";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import type { MobileOcrDetection, MobileJapaneseLearningOcrResult } from "@/lib/mobileJapaneseLearningOcr";
import {
  classifyMobileJapaneseLearningTokenPan,
  mobileJapaneseLearningMinConfidence,
  formatMobileJapaneseLearningChatTime,
  MOBILE_GRAMMAR_TOKEN_HIT_SLOP,
  mobileGrammarTokenAtPoint,
  mobileGrammarTokenCanAct,
  mobileGrammarTokenCategory,
  mobileGrammarTokenColor,
  mobileGrammarTokenInSelection,
  mobileGrammarTokenPosLabel,
  mobileJapaneseLearningChatRequestMessages,
  mobileJapaneseLearningSentenceText,
  mobileOcrLabelColor,
  mobileOcrLineKey,
  selectedMobileGrammarText,
  sortedMobileOcrLines,
  type MobileReaderThemeTokens,
} from "./mobileJapaneseLearningReaderHelpers";

const tokens = {
  success: "#success",
  primary: "#primary",
  danger: "#danger",
  foreground: "#foreground",
  mutedForeground: "#muted",
} satisfies MobileReaderThemeTokens;

function token(partOfSpeech: string, word = "word"): MobileGrammarToken {
  return {
    word,
    reading: "",
    partOfSpeech,
    meanings: [],
    conjugations: [],
    alternatives: [],
    components: [],
  };
}

function detection(over: Partial<MobileOcrDetection> & { order: number }): MobileOcrDetection {
  return {
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    conf: 1,
    cls: 0,
    label: "ja",
    text: "x",
    ...over,
  };
}

describe("mobileJapaneseLearningChatRequestMessages", () => {
  test("keeps the full model instruction when the bubble has a compact display question", () => {
    expect(mobileJapaneseLearningChatRequestMessages([{
      id: "ask-word", role: "user", createdAt: 0,
      text: "Explain 猫 using the requested response language and level.",
      displayText: "Explain this word: 猫",
    }])).toEqual([{
      role: "user", content: "Explain 猫 using the requested response language and level.",
    }]);
  });
  test("sends the whole thread like web getMessagesForRequest: hidden turns, tool calls and results", () => {
    const toolCalls = [{ toolCallId: "t1", toolName: "request_transcript", args: { pageNumber: 2 } }];
    const toolResults = [{ toolCallId: "t1", toolName: "request_transcript", result: "こんにちは" }];
    const out = mobileJapaneseLearningChatRequestMessages([
      { id: "0", role: "user", text: "NEMU_CTX_SNAPSHOT_V1 key=a", createdAt: 0, hidden: true },
      { id: "1", role: "user", text: "hello", createdAt: 0 },
      { id: "2", role: "assistant", text: "", createdAt: 0, hidden: true, toolCalls, toolResults },
      { id: "3", role: "assistant", text: "Network error. Please try again.", createdAt: 0 },
    ]);
    expect(out).toEqual([
      { role: "user", content: "NEMU_CTX_SNAPSHOT_V1 key=a" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "", toolCalls },
      { role: "tool", toolResults },
      { role: "assistant", content: "Network error. Please try again." },
    ]);
  });
});

describe("formatMobileJapaneseLearningChatTime", () => {
  test("returns a colon-formatted clock string", () => {
    const out = formatMobileJapaneseLearningChatTime(
      new Date(2024, 0, 1, 9, 5).getTime(),
      "en",
    );
    expect(out).toContain(":");
    expect(out).toMatch(/\d/);
  });
});

describe("sortedMobileOcrLines", () => {
  test("filters blank text and sorts by order ascending", () => {
    const result: MobileJapaneseLearningOcrResult = {
      source: "ocr",
      text: "full",
      detections: [
        detection({ order: 2, text: "b" }),
        detection({ order: 1, text: "a" }),
        detection({ order: 3, text: "   " }),
      ],
    };
    expect(sortedMobileOcrLines(result).map((d) => d.text)).toEqual(["a", "b"]);
  });
});

describe("mobileOcrLineKey", () => {
  test("encodes order + bounding box", () => {
    expect(mobileOcrLineKey(detection({ order: 4, x1: 1, y1: 2, x2: 3, y2: 4 }))).toBe(
      "4:1:2:3:4",
    );
  });
});

describe("mobileJapaneseLearningSentenceText", () => {
  const result: MobileJapaneseLearningOcrResult = {
    source: "ocr",
    text: "fallback",
    detections: [detection({ order: 1, text: "selected" })],
  };
  test("uses the selected detection text when found", () => {
    expect(mobileJapaneseLearningSentenceText(result, 1)).toBe("selected");
  });
  test("falls back to result.text when no selection", () => {
    expect(mobileJapaneseLearningSentenceText(result, null)).toBe("fallback");
  });
  test("falls back to result.text when order not found", () => {
    expect(mobileJapaneseLearningSentenceText(result, 99)).toBe("fallback");
  });
});

describe("mobileOcrLabelColor", () => {
  test("eng → success", () => {
    expect(mobileOcrLabelColor("eng", tokens)).toBe("#success");
  });
  test("ja → primary", () => {
    expect(mobileOcrLabelColor("ja", tokens)).toBe("#primary");
  });
  test("unknown → mutedForeground", () => {
    expect(mobileOcrLabelColor("unknown", tokens)).toBe("#muted");
  });
});

describe("mobileGrammarTokenCategory", () => {
  test.each([
    ["verb", "verb"],
    ["adjective", "adjective"],
    ["particle", "particle"],
    ["adverb", "adverb"],
    ["noun", "noun"],
    ["punctuation", "punctuation"],
    ["conjunction", "other"],
  ])("%s part-of-speech → %s", (pos, expected) => {
    expect(mobileGrammarTokenCategory(token(`aux-${pos}`))).toBe(expected);
  });
});

describe("mobileGrammarTokenColor", () => {
  test("verb → primary", () => {
    expect(mobileGrammarTokenColor(token("verb"), tokens)).toBe("#primary");
  });
  test("particle → danger", () => {
    expect(mobileGrammarTokenColor(token("particle"), tokens)).toBe("#danger");
  });
  test("other → mutedForeground", () => {
    expect(mobileGrammarTokenColor(token("conjunction"), tokens)).toBe("#muted");
  });
});

describe("mobileGrammarTokenPosLabel", () => {
  test.each([
    ["verb", "動"],
    ["adjective", "形"],
    ["particle", "助"],
    ["adverb", "副"],
    ["noun", "名"],
    ["conjunction", ""],
  ])("%s → %s", (pos, expected) => {
    expect(mobileGrammarTokenPosLabel(token(pos))).toBe(expected);
  });
});

describe("mobileGrammarTokenCanAct", () => {
  test("false for empty word", () => {
    expect(mobileGrammarTokenCanAct(token("noun", "  "))).toBe(false);
  });
  test("false for punctuation", () => {
    expect(mobileGrammarTokenCanAct(token("punctuation", "、"))).toBe(false);
  });
  test("true otherwise", () => {
    expect(mobileGrammarTokenCanAct(token("noun", "本"))).toBe(true);
  });
});

describe("mobileGrammarTokenAtPoint", () => {
  const layouts = [
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 20, y: 20, width: 10, height: 10 },
  ];
  test("hits the matching layout (last wins)", () => {
    expect(mobileGrammarTokenAtPoint(layouts, 5, 5)).toBe(0);
    expect(mobileGrammarTokenAtPoint(layouts, 25, 25)).toBe(1);
  });
  test("misses outside", () => {
    expect(mobileGrammarTokenAtPoint(layouts, 15, 15)).toBeNull();
  });
  test("skips undefined entries", () => {
    expect(mobileGrammarTokenAtPoint([undefined, layouts[1]], 25, 25)).toBe(1);
  });
  test("respects count limit", () => {
    expect(mobileGrammarTokenAtPoint(layouts, 25, 25, 1)).toBeNull();
  });
  test("a tap on the seam between two words picks the nearer one", () => {
    // Two chips 2pt apart (each has a 1pt margin), the second one shorter and
    // bottom-aligned like a word without furigana.
    const row = [
      { x: 1, y: 0, width: 40, height: 60 },
      { x: 43, y: 14, width: 30, height: 46 },
    ];
    expect(mobileGrammarTokenAtPoint(row, 41.5, 30)).toBeNull();
    expect(
      mobileGrammarTokenAtPoint(row, 41.5, 30, row.length, MOBILE_GRAMMAR_TOKEN_HIT_SLOP),
    ).toBe(0);
    expect(
      mobileGrammarTokenAtPoint(row, 42.6, 30, row.length, MOBILE_GRAMMAR_TOKEN_HIT_SLOP),
    ).toBe(1);
    // Above the shorter word, where its missing furigana row would be.
    expect(
      mobileGrammarTokenAtPoint(row, 58, 8, row.length, MOBILE_GRAMMAR_TOKEN_HIT_SLOP),
    ).toBe(1);
  });
  test("the slop never reaches a word further away than it", () => {
    expect(
      mobileGrammarTokenAtPoint(layouts, 12, 12, layouts.length, MOBILE_GRAMMAR_TOKEN_HIT_SLOP),
    ).toBe(0);
    expect(
      mobileGrammarTokenAtPoint(layouts, 60, 60, layouts.length, MOBILE_GRAMMAR_TOKEN_HIT_SLOP),
    ).toBeNull();
  });
  test("an exact hit wins over a nearer edge of another word", () => {
    expect(
      mobileGrammarTokenAtPoint(layouts, 25, 25, layouts.length, MOBILE_GRAMMAR_TOKEN_HIT_SLOP),
    ).toBe(1);
  });
});

describe("mobileGrammarTokenInSelection", () => {
  test("false when start or end is null", () => {
    expect(mobileGrammarTokenInSelection(1, null, 2)).toBe(false);
    expect(mobileGrammarTokenInSelection(1, 0, null)).toBe(false);
  });
  test("false when start === end", () => {
    expect(mobileGrammarTokenInSelection(1, 2, 2)).toBe(false);
  });
  test("true within range regardless of direction", () => {
    expect(mobileGrammarTokenInSelection(2, 1, 3)).toBe(true);
    expect(mobileGrammarTokenInSelection(2, 3, 1)).toBe(true);
  });
  test("false outside range", () => {
    expect(mobileGrammarTokenInSelection(5, 1, 3)).toBe(false);
  });
});

describe("selectedMobileGrammarText", () => {
  test("joins the words in the inclusive range", () => {
    const toks = [token("noun", "A"), token("noun", "B"), token("noun", "C"), token("noun", "D")];
    expect(selectedMobileGrammarText(toks, 1, 2)).toBe("BC");
  });
  test("works with a reversed range", () => {
    const toks = [token("noun", "A"), token("noun", "B"), token("noun", "C")];
    expect(selectedMobileGrammarText(toks, 2, 0)).toBe("ABC");
  });
});

describe("minimum confidence setting", () => {
  test("percentages from the plugin schema become OCR confidences", () => {
    expect(mobileJapaneseLearningMinConfidence(25)).toBe(0.25);
    expect(mobileJapaneseLearningMinConfidence(90)).toBe(0.9);
    expect(mobileJapaneseLearningMinConfidence(0.5)).toBe(0.5);
    expect(mobileJapaneseLearningMinConfidence(undefined)).toBe(0.25);
    expect(mobileJapaneseLearningMinConfidence(Number.NaN)).toBe(0.25);
  });
});

describe("classifyMobileJapaneseLearningTokenPan", () => {
  test("stays a tap inside the slop", () => {
    expect(classifyMobileJapaneseLearningTokenPan(3, -5)).toBe("pending");
  });
  test("a predominantly vertical pan scrolls the pane", () => {
    expect(classifyMobileJapaneseLearningTokenPan(2, -30)).toBe("scroll");
    expect(classifyMobileJapaneseLearningTokenPan(-6, 12)).toBe("scroll");
  });
  test("a horizontal or diagonal drag selects words", () => {
    expect(classifyMobileJapaneseLearningTokenPan(20, 3)).toBe("select");
    expect(classifyMobileJapaneseLearningTokenPan(-10, 10)).toBe("select");
  });
});
