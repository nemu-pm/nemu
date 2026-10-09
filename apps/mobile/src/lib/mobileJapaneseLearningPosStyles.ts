import type { MobileGrammarToken } from "./mobileJapaneseLearningGrammar";

/**
 * Web parity for the Japanese Learning part-of-speech colours.
 *
 * Every value here is generated from the web sources, not picked by eye:
 * - token chips: `src/index.css` `.pos-*` custom properties and
 *   `.textbook-token` (`color-mix(in oklch, var(--pos-bg) 62%|68%, var(--background))`,
 *   `border-bottom: 2px color-mix(var(--pos-border) 65%|72%)`, selected 82%|86%,
 *   multi-select `color-mix(var(--primary) 18%|20%)`), mixed against the web
 *   `--background` of each theme and converted from OKLCH to sRGB;
 * - POS tags: `pos-styles.ts` `tag` classes (Tailwind v4 palette: light
 *   `bg-*-100 text-*-800 border-*-200`, dark `bg-*-500/15 text-*-300 border-*-500/30`);
 * - category rules: `grammar-analysis.ts` `getPOSCategory` and
 *   `token-display.tsx` `getPOSClass` / `getPOSLabel`.
 */

export type JapaneseLearningPosCategory =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "particle"
  | "pronoun"
  | "conjunction"
  | "copula"
  | "interjection"
  | "auxiliary"
  | "counter"
  | "expression"
  | "numeric"
  | "prefix-suffix"
  | "punctuation"
  | "unknown"
  | "other";

export type JapaneseLearningColorScheme = "light" | "dark";

/** Web `PartOfSpeechLabels` → `PartOfSpeechCategoryMap` (exact label match first). */
const POS_LABEL_CATEGORY: Record<string, JapaneseLearningPosCategory> = {
  "I-Adjective": "adjective",
  "I-Adjective (Archaic)": "adjective",
  "Na-Adjective": "adjective",
  "No-Adjective": "adjective",
  "Pre-noun Adjective": "adjective",
  "Taru-Adjective": "adjective",
  Prenominal: "adjective",
  Adverb: "adverb",
  "To-Adverb": "adverb",
  "Auxiliary Verb": "auxiliary",
  "Auxiliary Adjective": "auxiliary",
  Conjunction: "conjunction",
  Copula: "copula",
  "Copula (だ)": "copula",
  Counter: "counter",
  Expression: "expression",
  Interjection: "interjection",
  Noun: "noun",
  "Adverbial Noun": "noun",
  "Noun Suffix": "noun",
  "Noun Prefix": "noun",
  "Temporal Noun": "noun",
  Number: "numeric",
  Pronoun: "pronoun",
  Particle: "particle",
  Prefix: "prefix-suffix",
  Suffix: "prefix-suffix",
  "Ichidan Verb (-ru)": "verb",
  "Ichidan Verb (-ru Special)": "verb",
  "Godan Verb (-aru)": "verb",
  "Godan Verb (-bu)": "verb",
  "Godan Verb (-gu)": "verb",
  "Godan Verb (-ku)": "verb",
  "Godan Verb (-ku Special)": "verb",
  "Godan Verb (-mu)": "verb",
  "Godan Verb (-nu)": "verb",
  "Godan Verb (-ru)": "verb",
  "Godan Verb (-ru Irregular)": "verb",
  "Godan Verb (-su)": "verb",
  "Godan Verb (-tsu)": "verb",
  "Godan Verb (-u)": "verb",
  "Godan Verb (-u Special)": "verb",
  "Kuru Verb": "verb",
  "Suru Verb": "verb",
  "Suru Verb (Included)": "verb",
  "Suru Verb (Special)": "verb",
  "Transitive Verb": "verb",
  "Intransitive Verb": "verb",
  "Zuru Verb": "verb",
  "Godan Verb (-uru)": "verb",
  Onomatopoeia: "expression",
  Unclassified: "other",
  Punctuation: "punctuation",
};

/** Mirrors web `getPOSCategory(pos)` in grammar-analysis.ts, including its fallbacks. */
export function mobileJapaneseLearningPosCategoryForLabel(
  pos: string,
): JapaneseLearningPosCategory {
  if (!pos) return "other";
  const exact = POS_LABEL_CATEGORY[pos];
  if (exact) return exact;
  const value = pos.toLowerCase();
  if (value === "unknown") return "unknown";
  if (value === "punctuation") return "punctuation";
  if (value.includes("noun") || value.includes("n")) return "noun";
  if (value.includes("verb") || value.includes("v")) return "verb";
  if (value.includes("adj")) return "adjective";
  if (value.includes("adv")) return "adverb";
  if (value.includes("prt") || value.includes("particle")) return "particle";
  if (value.includes("pron")) return "pronoun";
  if (value.includes("conj")) return "conjunction";
  if (value.includes("cop")) return "copula";
  if (value.includes("int")) return "interjection";
  if (value.includes("aux")) return "auxiliary";
  return "other";
}

export function mobileJapaneseLearningPosCategory(
  token: Pick<MobileGrammarToken, "partOfSpeech">,
): JapaneseLearningPosCategory {
  return mobileJapaneseLearningPosCategoryForLabel(token.partOfSpeech);
}

/** Web token-display.tsx `getPOSLabel`. */
const POS_LABELS: Partial<Record<JapaneseLearningPosCategory, string>> = {
  noun: "名",
  verb: "動",
  adjective: "形",
  adverb: "副",
  particle: "助",
  pronoun: "代",
  conjunction: "接",
  copula: "繋",
  interjection: "感",
  auxiliary: "助動",
  counter: "助数",
  expression: "表現",
  numeric: "数",
  "prefix-suffix": "接辞",
};

export function mobileJapaneseLearningPosLabel(
  token: Pick<MobileGrammarToken, "partOfSpeech">,
): string {
  return POS_LABELS[mobileJapaneseLearningPosCategory(token)] ?? "";
}

/** Web `getPOSClass`: which `.pos-*` palette a category's chip uses. */
type PosPaletteKey =
  | "noun"
  | "verb"
  | "adjective"
  | "particle"
  | "adverb"
  | "auxiliary"
  | "copula"
  | "pronoun"
  | "expression"
  | "numeric"
  | "conjunction"
  | "prefix-suffix"
  | "unknown";

const POS_PALETTE_KEY: Record<JapaneseLearningPosCategory, PosPaletteKey> = {
  noun: "noun",
  verb: "verb",
  adjective: "adjective",
  adverb: "adverb",
  particle: "particle",
  pronoun: "pronoun",
  conjunction: "conjunction",
  copula: "copula",
  interjection: "expression",
  auxiliary: "auxiliary",
  counter: "numeric",
  expression: "expression",
  numeric: "numeric",
  "prefix-suffix": "prefix-suffix",
  punctuation: "unknown",
  unknown: "unknown",
  other: "unknown",
};

export type JapaneseLearningTokenPalette = {
  /** `--pos-text`: the word and its POS label. */
  text: string;
  /** `.textbook-token` background. */
  background: string;
  /** 2pt bottom rule. */
  underline: string;
  selectedBackground: string;
  selectedUnderline: string;
};

const TOKEN_PALETTE: Record<JapaneseLearningColorScheme, Record<PosPaletteKey, JapaneseLearningTokenPalette>> = {
  light: {
    noun: {
      text: "#003f71",
      background: "#e7f2ff",
      underline: "#aecbeb",
      selectedBackground: "#e0f0fe",
      selectedUnderline: "#7fb5dc"
    },
    verb: {
      text: "#00411a",
      background: "#ddf7f7",
      underline: "#72c4c3",
      selectedBackground: "#d7f6ed",
      selectedUnderline: "#49a46e"
    },
    adjective: {
      text: "#53347e",
      background: "#f0efff",
      underline: "#bcb7e7",
      selectedBackground: "#efeaff",
      selectedUnderline: "#a890d4"
    },
    particle: {
      text: "#763000",
      background: "#ffe2e7",
      underline: "#f3a5ac",
      selectedBackground: "#ffdecf",
      selectedUnderline: "#d58d25"
    },
    adverb: {
      text: "#664700",
      background: "#ffecec",
      underline: "#eab1ad",
      selectedBackground: "#ffebdc",
      selectedUnderline: "#c1a057"
    },
    auxiliary: {
      text: "#005455",
      background: "#e5f4fa",
      underline: "#97c6d6",
      selectedBackground: "#def2f5",
      selectedUnderline: "#5daeae"
    },
    copula: {
      text: "#7d3b5d",
      background: "#f8effb",
      underline: "#d9bdde",
      selectedBackground: "#faebf6",
      selectedUnderline: "#d599b5"
    },
    pronoun: {
      text: "#2e3d77",
      background: "#e9effd",
      underline: "#a8b8e6",
      selectedBackground: "#e4ebfd",
      selectedUnderline: "#8095d6"
    },
    expression: {
      text: "#822d22",
      background: "#ffecf7",
      underline: "#e9adcb",
      selectedBackground: "#ffe8ec",
      selectedUnderline: "#e68677"
    },
    numeric: {
      text: "#00535f",
      background: "#e8f3f9",
      underline: "#a4c3d4",
      selectedBackground: "#e2f1f6",
      selectedUnderline: "#71a9b3"
    },
    conjunction: {
      text: "#833b48",
      background: "#fceef9",
      underline: "#deb2d3",
      selectedBackground: "#ffeaf2",
      selectedUnderline: "#db8a96"
    },
    "prefix-suffix": {
      text: "#454778",
      background: "#eef0fb",
      underline: "#b6bcd9",
      selectedBackground: "#ebedfa",
      selectedUnderline: "#979bc4"
    },
    unknown: {
      text: "#555555",
      background: "#f2f3f4",
      underline: "#d2d2d4",
      selectedBackground: "#f0f0f1",
      selectedUnderline: "#bebebe"
    }
  },
  dark: {
    noun: {
      text: "#8ec5ec",
      background: "#0c131a",
      underline: "#2e5578",
      selectedBackground: "#0c151d",
      selectedUnderline: "#3179a6"
    },
    verb: {
      text: "#82cb9b",
      background: "#061515",
      underline: "#00615a",
      selectedBackground: "#061714",
      selectedUnderline: "#258651"
    },
    adjective: {
      text: "#ccb9f1",
      background: "#12111b",
      underline: "#5c5289",
      selectedBackground: "#14121f",
      selectedUnderline: "#8c6ebd"
    },
    particle: {
      text: "#ffcc8e",
      background: "#281314",
      underline: "#984c47",
      selectedBackground: "#2e170a",
      selectedUnderline: "#c47d04"
    },
    adverb: {
      text: "#e6ca91",
      background: "#1b1110",
      underline: "#7f4c3e",
      selectedBackground: "#1e140c",
      selectedUnderline: "#9c7b31"
    },
    auxiliary: {
      text: "#90caca",
      background: "#081317",
      underline: "#255a66",
      selectedBackground: "#071518",
      selectedUnderline: "#2a8080"
    },
    copula: {
      text: "#e3b5ca",
      background: "#161018",
      underline: "#724c71",
      selectedBackground: "#1a1119",
      selectedUnderline: "#ad6689"
    },
    pronoun: {
      text: "#a9bcf2",
      background: "#0e1119",
      underline: "#414f7a",
      selectedBackground: "#0f131d",
      selectedUnderline: "#5b6eac"
    },
    expression: {
      text: "#febbaf",
      background: "#1b1116",
      underline: "#82455d",
      selectedBackground: "#201315",
      selectedUnderline: "#bd6254"
    },
    numeric: {
      text: "#99c7d0",
      background: "#0c1317",
      underline: "#365765",
      selectedBackground: "#0c151a",
      selectedUnderline: "#447b85"
    },
    conjunction: {
      text: "#edb2ba",
      background: "#171016",
      underline: "#744763",
      selectedBackground: "#1b1117",
      selectedUnderline: "#ac606d"
    },
    "prefix-suffix": {
      text: "#b7bbde",
      background: "#101118",
      underline: "#4b506b",
      selectedBackground: "#12131c",
      selectedUnderline: "#6a6e94"
    },
    unknown: {
      text: "#aeaeae",
      background: "#111214",
      underline: "#474849",
      selectedBackground: "#131416",
      selectedUnderline: "#636363"
    }
  }
};

/** `.textbook-token[data-multi-selected]`: one primary highlight across the range. */
const MULTI_SELECT_PALETTE: Record<JapaneseLearningColorScheme, { background: string; underline: string }> = {
  light: {
    background: "#d9e4ff",
    underline: "#91acfc"
  },
  dark: {
    background: "#192034",
    underline: "#455dab"
  }
};

export function mobileJapaneseLearningTokenPalette(
  token: Pick<MobileGrammarToken, "partOfSpeech">,
  scheme: JapaneseLearningColorScheme,
): JapaneseLearningTokenPalette {
  return TOKEN_PALETTE[scheme][POS_PALETTE_KEY[mobileJapaneseLearningPosCategory(token)]];
}

export function mobileJapaneseLearningMultiSelectPalette(
  scheme: JapaneseLearningColorScheme,
): { background: string; underline: string } {
  return MULTI_SELECT_PALETTE[scheme];
}

export type JapaneseLearningPosTagStyle = {
  background: string;
  text: string;
  border: string;
};

const POS_TAG_STYLES: Record<JapaneseLearningColorScheme, Record<JapaneseLearningPosCategory, JapaneseLearningPosTagStyle>> = {
  light: {
    noun: {
      background: "#dbeafe",
      text: "#193cb8",
      border: "#bedbff"
    },
    verb: {
      background: "#dcfce7",
      text: "#016630",
      border: "#b9f8cf"
    },
    adjective: {
      background: "#f3e8ff",
      text: "#6e11b0",
      border: "#e9d4ff"
    },
    adverb: {
      background: "#fef3c6",
      text: "#973c00",
      border: "#fee685"
    },
    particle: {
      background: "#f1f5f9",
      text: "#1d293d",
      border: "#e2e8f0"
    },
    pronoun: {
      background: "#e0e7ff",
      text: "#372aac",
      border: "#c6d2ff"
    },
    conjunction: {
      background: "#ffe4e6",
      text: "#a50036",
      border: "#ffccd3"
    },
    copula: {
      background: "#fce7f3",
      text: "#a3004c",
      border: "#fccee8"
    },
    interjection: {
      background: "#ffedd4",
      text: "#9f2d00",
      border: "#ffd6a7"
    },
    auxiliary: {
      background: "#cbfbf1",
      text: "#005f5a",
      border: "#96f7e4"
    },
    counter: {
      background: "#ffe2e2",
      text: "#9f0712",
      border: "#ffc9c9"
    },
    expression: {
      background: "#ecfcca",
      text: "#3c6300",
      border: "#d8f999"
    },
    numeric: {
      background: "#cefafe",
      text: "#005f78",
      border: "#a2f4fd"
    },
    "prefix-suffix": {
      background: "#ede9fe",
      text: "#5d0ec0",
      border: "#ddd6ff"
    },
    unknown: {
      background: "#f3f4f6",
      text: "#4a5565",
      border: "#d1d5dc"
    },
    other: {
      background: "#f1f5f9",
      text: "#1d293d",
      border: "#e2e8f0"
    },
    punctuation: {
      background: "#f3f4f6",
      text: "#4a5565",
      border: "#e5e7eb"
    }
  },
  dark: {
    noun: {
      background: "rgba(43,127,255,0.15)",
      text: "#8ec5ff",
      border: "rgba(43,127,255,0.3)"
    },
    verb: {
      background: "rgba(0,201,80,0.15)",
      text: "#7bf1a8",
      border: "rgba(0,201,80,0.3)"
    },
    adjective: {
      background: "rgba(173,70,255,0.15)",
      text: "#dab2ff",
      border: "rgba(173,70,255,0.3)"
    },
    adverb: {
      background: "rgba(254,154,0,0.15)",
      text: "#ffd230",
      border: "rgba(254,154,0,0.3)"
    },
    particle: {
      background: "rgba(98,116,142,0.15)",
      text: "#cad5e2",
      border: "rgba(98,116,142,0.3)"
    },
    pronoun: {
      background: "rgba(97,95,255,0.15)",
      text: "#a3b3ff",
      border: "rgba(97,95,255,0.3)"
    },
    conjunction: {
      background: "rgba(255,32,86,0.15)",
      text: "#ffa1ad",
      border: "rgba(255,32,86,0.3)"
    },
    copula: {
      background: "rgba(246,51,154,0.15)",
      text: "#fda5d5",
      border: "rgba(246,51,154,0.3)"
    },
    interjection: {
      background: "rgba(255,105,0,0.15)",
      text: "#ffb86a",
      border: "rgba(255,105,0,0.3)"
    },
    auxiliary: {
      background: "rgba(0,187,167,0.15)",
      text: "#46ecd5",
      border: "rgba(0,187,167,0.3)"
    },
    counter: {
      background: "rgba(251,44,54,0.15)",
      text: "#ffa2a2",
      border: "rgba(251,44,54,0.3)"
    },
    expression: {
      background: "rgba(124,207,0,0.15)",
      text: "#bbf451",
      border: "rgba(124,207,0,0.3)"
    },
    numeric: {
      background: "rgba(0,184,219,0.15)",
      text: "#53eafd",
      border: "rgba(0,184,219,0.3)"
    },
    "prefix-suffix": {
      background: "rgba(142,81,255,0.15)",
      text: "#c4b4ff",
      border: "rgba(142,81,255,0.3)"
    },
    unknown: {
      background: "rgba(106,114,130,0.15)",
      text: "#99a1af",
      border: "rgba(106,114,130,0.3)"
    },
    other: {
      background: "rgba(98,116,142,0.15)",
      text: "#cad5e2",
      border: "rgba(98,116,142,0.3)"
    },
    punctuation: {
      background: "rgba(106,114,130,0.15)",
      text: "#99a1af",
      border: "rgba(106,114,130,0.3)"
    }
  }
};

/** Web `POSTag`: a category-coloured pill for a human-readable POS label. */
export function mobileJapaneseLearningPosTagStyle(
  pos: string,
  scheme: JapaneseLearningColorScheme,
): JapaneseLearningPosTagStyle {
  return POS_TAG_STYLES[scheme][mobileJapaneseLearningPosCategoryForLabel(pos)];
}

/** Whether a token can be acted on (has a word and isn't punctuation). */
export function mobileJapaneseLearningTokenCanAct(
  token: Pick<MobileGrammarToken, "word" | "partOfSpeech">,
): boolean {
  return (
    token.word.trim().length > 0 &&
    mobileJapaneseLearningPosCategory(token) !== "punctuation"
  );
}
