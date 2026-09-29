import { type AppLanguage } from "@/data/schema";
import {
  type MobileJapaneseLearningChatMessage,
  type MobileJapaneseLearningChatToolCall,
  type MobileJapaneseLearningChatToolResult,
} from "@/lib/mobileJapaneseLearningChat";
import { mobileJapaneseLearningChatMessagesForRequest } from "@/lib/mobileJapaneseLearningChatStream";
import {
  type MobileGrammarToken,
} from "@/lib/mobileJapaneseLearningGrammar";
import {
  type MobileJapaneseLearningOcrResult,
  type MobileOcrDetection,
} from "@/lib/mobileJapaneseLearningOcr";
import { formatMobileClockTime } from "./mobileLocaleFormat";

/**
 * Theme tokens the grammar/OCR color helpers read. Kept as a structural type
 * so this pure-logic module does not depend on the design-system hook (and so
 * it stays unit-testable under bun without importing `@/design-system`).
 */
export type MobileReaderThemeTokens = {
  success: string;
  primary: string;
  danger: string;
  foreground: string;
  mutedForeground: string;
};

/**
 * One row in the chat thread UI. Extracted from ReaderScreen so the
 * request-building helper can live alongside it.
 */
export type JapaneseLearningChatThreadMessage = {
  id: string;
  role: "user" | "assistant";
  kind?: "text" | "voice";
  text: string;
  /** Localized user-facing question; text retains the full model prompt. */
  displayText?: string;
  ttsText?: string;
  createdAt: number;
  hidden?: boolean;
  isRead?: boolean;
  isError?: boolean;
  /** Web store: the hidden assistant turn that asked for client tools. */
  toolCalls?: MobileJapaneseLearningChatToolCall[];
  toolResults?: MobileJapaneseLearningChatToolResult[];
};

/** Measured layout of a grammar token in the overlay, used for hit-testing. */
export type JapaneseLearningTokenLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Web `getMessagesForRequest`: the whole thread, hidden turns and tool results included. */
export function mobileJapaneseLearningChatRequestMessages(
  messages: JapaneseLearningChatThreadMessage[],
): MobileJapaneseLearningChatMessage[] {
  return mobileJapaneseLearningChatMessagesForRequest(messages);
}

export function formatMobileJapaneseLearningChatTime(
  timestamp: number,
  appLanguage: AppLanguage,
): string {
  // Android's ICU-less JSC ignores the locale and options of Date#toLocale*.
  return formatMobileClockTime(timestamp, appLanguage);
}

export function sortedMobileOcrLines(
  result: MobileJapaneseLearningOcrResult,
): MobileOcrDetection[] {
  return result.detections
    .filter((detection) => detection.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.order - b.order);
}

export function mobileOcrLineKey(line: MobileOcrDetection): string {
  return `${line.order}:${line.x1}:${line.y1}:${line.x2}:${line.y2}`;
}

export function mobileJapaneseLearningSentenceText(
  result: MobileJapaneseLearningOcrResult,
  selectedOrder: number | null,
): string {
  const selectedText =
    selectedOrder == null
      ? ""
      : result.detections
          .find((detection) => detection.order === selectedOrder)
          ?.text.trim() ?? "";
  return (selectedText || result.text).trim();
}

export function mobileOcrLabelColor(
  label: MobileOcrDetection["label"],
  tokens: MobileReaderThemeTokens,
): string {
  if (label === "eng") return tokens.success;
  if (label === "ja") return tokens.primary;
  return tokens.mutedForeground;
}

export function mobileGrammarTokenCategory(token: MobileGrammarToken): string {
  const pos = token.partOfSpeech.toLowerCase();
  // `adverb` must be checked before `verb`: "adverb" contains the substring
  // "verb", so checking verb first would misclassify every adverb as a verb.
  if (pos.includes("adverb")) return "adverb";
  if (pos.includes("verb")) return "verb";
  if (pos.includes("adjective")) return "adjective";
  if (pos.includes("particle")) return "particle";
  if (pos.includes("noun")) return "noun";
  if (pos.includes("punctuation")) return "punctuation";
  return "other";
}

export function mobileGrammarTokenColor(
  token: MobileGrammarToken,
  tokens: MobileReaderThemeTokens,
): string {
  const category = mobileGrammarTokenCategory(token);
  if (category === "verb") return tokens.primary;
  if (category === "adjective") return tokens.success;
  if (category === "particle") return tokens.danger;
  if (category === "noun") return tokens.foreground;
  return tokens.mutedForeground;
}

export function mobileGrammarTokenPosLabel(token: MobileGrammarToken): string {
  const category = mobileGrammarTokenCategory(token);
  if (category === "verb") return "動";
  if (category === "adjective") return "形";
  if (category === "particle") return "助";
  if (category === "adverb") return "副";
  if (category === "noun") return "名";
  return "";
}

export function mobileGrammarTokenCanAct(token: MobileGrammarToken): boolean {
  return (
    token.word.trim().length > 0 &&
    mobileGrammarTokenCategory(token) !== "punctuation"
  );
}

export function mobileGrammarTokenAtPoint(
  layouts: Array<JapaneseLearningTokenLayout | undefined>,
  x: number,
  y: number,
  count = layouts.length,
): number | null {
  for (let index = count - 1; index >= 0; index -= 1) {
    const layout = layouts[index];
    if (!layout) continue;
    if (
      x >= layout.x &&
      x <= layout.x + layout.width &&
      y >= layout.y &&
      y <= layout.y + layout.height
    ) {
      return index;
    }
  }
  return null;
}

export function mobileGrammarTokenInSelection(
  index: number,
  start: number | null,
  end: number | null,
): boolean {
  if (start == null || end == null || start === end) return false;
  return index >= Math.min(start, end) && index <= Math.max(start, end);
}

export function selectedMobileGrammarText(
  tokens: MobileGrammarToken[],
  start: number,
  end: number,
): string {
  return tokens
    .slice(Math.min(start, end), Math.max(start, end) + 1)
    .map((token) => token.word)
    .join("")
    .trim();
}

/**
 * The plugin's "Minimum confidence" setting is stored as a percentage
 * (10–90, default 25, like web's schema) while OCR confidences are 0–1.
 * Web divides by 100 in `setSettings`; this does the same for the reader.
 */
export function mobileJapaneseLearningMinConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0.25;
  return value > 1 ? Math.min(1, value / 100) : value;
}
