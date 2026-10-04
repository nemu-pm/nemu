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
import type { MobileStrings } from "./mobileI18n";

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

/** Movement (pt) before a drag on the sentence's words commits to selecting or scrolling. */
export const MOBILE_JAPANESE_LEARNING_TOKEN_PAN_SLOP = 8;

/**
 * What a drag that starts on the sentence's words does, decided once it has
 * moved `MOBILE_JAPANESE_LEARNING_TOKEN_PAN_SLOP`: a predominantly vertical
 * pan (steeper than ~50°) scrolls the sentence pane, like any iOS list;
 * anything flatter drags a selection across the words (web's drag-select).
 * Still inside the slop it stays a tap.
 */
export function classifyMobileJapaneseLearningTokenPan(
  dx: number,
  dy: number,
): "pending" | "select" | "scroll" {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < MOBILE_JAPANESE_LEARNING_TOKEN_PAN_SLOP) return "pending";
  return ay > ax * 1.2 ? "scroll" : "select";
}

/**
 * The sentence view's analysis error line. A server feature used signed out
 * shows the sign-in line; a failed dictionary download is the pack's error
 * whenever the cloud is not a fallback (On Device, or Automatic signed out).
 */
export function mobileJapaneseLearningAnalysisErrorText(input: {
  detail: string;
  packFailed: boolean;
  preference: "auto" | "onDevice" | "cloud";
  signedIn: boolean;
  strings: {
    reader: Pick<
      MobileStrings["reader"],
      "pluginJapaneseLearningSignInRequired" | "pluginJapaneseLearningGrammarFailed"
    >;
    japaneseLearningDictionary: Pick<
      MobileStrings["japaneseLearningDictionary"],
      "analysisDownloadFailed"
    >;
  };
}): string {
  const { strings } = input;
  if (input.detail === strings.reader.pluginJapaneseLearningSignInRequired) {
    return strings.reader.pluginJapaneseLearningSignInRequired;
  }
  const cloudFallback = input.preference === "auto" && input.signedIn;
  if (input.packFailed && input.preference !== "cloud" && !cloudFallback) {
    return strings.japaneseLearningDictionary.analysisDownloadFailed;
  }
  return strings.reader.pluginJapaneseLearningGrammarFailed;
}
