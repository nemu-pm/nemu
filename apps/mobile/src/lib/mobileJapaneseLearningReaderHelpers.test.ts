import { describe, expect, test } from "bun:test";
import type { MobileGrammarToken } from "@/lib/mobileJapaneseLearningGrammar";
import type { MobileOcrDetection, MobileJapaneseLearningOcrResult } from "@/lib/mobileJapaneseLearningOcr";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  formatMobileJapaneseLearningChatTime,
  mobileGrammarTokenAtPoint,
  mobileGrammarTokenCanAct,
  mobileGrammarTokenCategory,
  mobileGrammarTokenColor,
  mobileGrammarTokenInSelection,
  mobileGrammarTokenPosLabel,
  mobileJapaneseLearningChatErrorDetail,
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

const strings = {
  reader: {
    pluginJapaneseLearningSignInRequired: "Sign in required",
    pluginJapaneseLearningChatFailed: "Chat failed",
  },
} as unknown as MobileStrings;

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
  test("drops error and empty messages and trims content", () => {
    const out = mobileJapaneseLearningChatRequestMessages([
      { id: "1", role: "user", text: "  hello  ", createdAt: 0 },
      { id: "2", role: "assistant", text: "", createdAt: 0 },
      { id: "3", role: "user", text: "boom", createdAt: 0, isError: true },
    ]);
    expect(out).toEqual([{ role: "user", content: "hello" }]);
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

describe("mobileJapaneseLearningChatErrorDetail", () => {
  test("auth_required → sign-in copy", () => {
    expect(mobileJapaneseLearningChatErrorDetail(new Error("auth_required"), strings)).toBe(
      "Sign in required",
    );
  });
  test("context_too_long → chat failed copy", () => {
    expect(
      mobileJapaneseLearningChatErrorDetail(new Error("context_too_long"), strings),
    ).toBe("Chat failed");
  });
  test("other Error → localized copy followed by sanitized diagnostics", () => {
    expect(mobileJapaneseLearningChatErrorDetail(new Error("boom"), strings)).toBe(
      "Chat failed\nboom",
    );
    expect(
      mobileJapaneseLearningChatErrorDetail(
        new Error("password=secret"),
        strings,
      ),
    ).toBe("Chat failed\npassword=[redacted]");
  });
  test("non-Error → localized copy followed by diagnostics", () => {
    expect(mobileJapaneseLearningChatErrorDetail("nope", strings)).toBe(
      "Chat failed\nnope",
    );
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
