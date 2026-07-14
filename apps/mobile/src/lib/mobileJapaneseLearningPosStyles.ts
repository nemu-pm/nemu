import type { MobileGrammarToken } from "./mobileJapaneseLearningGrammar";
import type { MobileReaderThemeTokens } from "./mobileJapaneseLearningReaderHelpers";

/**
 * Mobile port of the web `pos-styles.ts` / `grammar-analysis.ts` POS category
 * system. The web uses Tailwind CSS classes per POS category (13 categories);
 * mobile cannot use CSS classes the same way, so this module returns hex
 * colors derived from theme tokens plus a fixed palette mirroring the web's
 * color choices (blue= noun, green= verb, purple= adjective, …).
 *
 * This replaces the previous 5-category `mobileGrammarTokenColor` helper and
 * the 5-label `mobileGrammarTokenPosLabel` helper, matching the web 1:1.
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

// Mirrors web `getPOSCategory` in grammar-analysis.ts — substring matching on
// the human-readable POS label produced by ichiran.
export function mobileJapaneseLearningPosCategory(
  token: MobileGrammarToken,
): JapaneseLearningPosCategory {
  const pos = token.partOfSpeech.toLowerCase();
  if (!pos) return "other";
  // `adverb` must be checked before `verb` (substring collision).
  if (pos.includes("adverb")) return "adverb";
  if (pos.includes("verb")) return "verb";
  if (pos.includes("adjective")) return "adjective";
  if (pos.includes("particle") || pos.includes("prt")) return "particle";
  if (pos.includes("noun") || pos === "n") return "noun";
  if (pos.includes("pronoun") || pos.includes("pron")) return "pronoun";
  if (pos.includes("conjunction") || pos.includes("conj")) return "conjunction";
  if (pos.includes("copula") || pos.includes("cop")) return "copula";
  if (pos.includes("interjection") || pos === "int") return "interjection";
  if (pos.includes("auxiliary") || pos.includes("aux")) return "auxiliary";
  if (pos.includes("counter") || pos.includes("ctr")) return "counter";
  if (pos.includes("expression") || pos.includes("exp")) return "expression";
  if (pos.includes("number") || pos.includes("num")) return "numeric";
  if (pos.includes("prefix") || pos.includes("suffix")) return "prefix-suffix";
  if (pos.includes("punctuation")) return "punctuation";
  if (pos.includes("unknown")) return "unknown";
  return "other";
}

// Web → kanji label (token-display.tsx getPOSLabel)
const POS_LABELS: Record<JapaneseLearningPosCategory, string> = {
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
  punctuation: "",
  unknown: "",
  other: "",
};

export function mobileJapaneseLearningPosLabel(
  token: MobileGrammarToken,
): string {
  return POS_LABELS[mobileJapaneseLearningPosCategory(token)] ?? "";
}

// Per-category hex palette mirroring web `POS_STYLES` (light variant tones).
// `bg` is the token background tint, `text` is the foreground, `border` the
// border color. Mobile has no light/dark CSS variants, so we pick mid-tones
// readable on both themes; selected states use the stronger `full` tone.
export interface JapaneseLearningPosStyle {
  bg: string;
  bgStrong: string;
  text: string;
  border: string;
}

const POS_PALETTE: Record<JapaneseLearningPosCategory, JapaneseLearningPosStyle> = {
  noun: { bg: "#3b82f618", bgStrong: "#3b82f633", text: "#3b82f6", border: "#3b82f655" },
  verb: { bg: "#22c55e18", bgStrong: "#22c55e33", text: "#22c55e", border: "#22c55e55" },
  adjective: { bg: "#a855f718", bgStrong: "#a855f733", text: "#a855f7", border: "#a855f755" },
  adverb: { bg: "#f59e0b18", bgStrong: "#f59e0b33", text: "#f59e0b", border: "#f59e0b55" },
  particle: { bg: "#64748b18", bgStrong: "#64748b33", text: "#64748b", border: "#64748b55" },
  pronoun: { bg: "#6366f118", bgStrong: "#6366f133", text: "#6366f1", border: "#6366f155" },
  conjunction: { bg: "#f43f5e18", bgStrong: "#f43f5e33", text: "#f43f5e", border: "#f43f5e55" },
  copula: { bg: "#ec489918", bgStrong: "#ec489933", text: "#ec4899", border: "#ec489955" },
  interjection: { bg: "#f9731618", bgStrong: "#f9731633", text: "#f97316", border: "#f9731655" },
  auxiliary: { bg: "#14b8a618", bgStrong: "#14b8a633", text: "#14b8a6", border: "#14b8a655" },
  counter: { bg: "#ef444418", bgStrong: "#ef444433", text: "#ef4444", border: "#ef444455" },
  expression: { bg: "#84cc1618", bgStrong: "#84cc1633", text: "#84cc16", border: "#84cc1655" },
  numeric: { bg: "#06b6d418", bgStrong: "#06b6d433", text: "#06b6d4", border: "#06b6d455" },
  "prefix-suffix": { bg: "#8b5cf618", bgStrong: "#8b5cf633", text: "#8b5cf6", border: "#8b5cf655" },
  punctuation: { bg: "#9ca3af18", bgStrong: "#9ca3af33", text: "#9ca3af", border: "#9ca3af55" },
  unknown: { bg: "#9ca3af18", bgStrong: "#9ca3af33", text: "#9ca3af", border: "#9ca3af55" },
  other: { bg: "#64748b18", bgStrong: "#64748b33", text: "#64748b", border: "#64748b55" },
};

export function mobileJapaneseLearningPosStyle(
  token: MobileGrammarToken,
): JapaneseLearningPosStyle {
  return POS_PALETTE[mobileJapaneseLearningPosCategory(token)] ?? POS_PALETTE.other;
}

/** Token chip background: light tint normally, strong when selected. */
export function mobileJapaneseLearningTokenBackground(
  token: MobileGrammarToken,
  selected: boolean,
): string {
  const style = mobileJapaneseLearningPosStyle(token);
  return selected ? style.bgStrong : style.bg;
}

/** POS label color (used for the small kanji label under a token). */
export function mobileJapaneseLearningTokenLabelColor(
  token: MobileGrammarToken,
  tokens: MobileReaderThemeTokens,
): string {
  const style = mobileJapaneseLearningPosStyle(token);
  return style.text === tokens.foreground ? tokens.mutedForeground : style.text;
}

/** Whether a token can be acted on (has a word and isn't punctuation). */
export function mobileJapaneseLearningTokenCanAct(
  token: MobileGrammarToken,
): boolean {
  return (
    token.word.trim().length > 0 &&
    mobileJapaneseLearningPosCategory(token) !== "punctuation"
  );
}