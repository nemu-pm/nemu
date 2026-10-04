import type { AppLanguage } from "@/data/schema";
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

/**
 * Pure helpers for the Nemu chat composer's voice input. Mirrors web
 * `LineInputBar` in `src/lib/plugins/builtin/japanese-learning/chat/ui/drawer.tsx`:
 *
 * - recognition locale follows the app language (`getSpeechLang`),
 * - `continuous: false`, `interimResults: true`,
 * - every result replaces the draft with the full transcript so far,
 * - the mic sits in the send slot and only shows while the draft is empty,
 * - `end` / `error` silently return to idle (no toast, no auto-send).
 */

/** The native module surface the hook uses (a subset of ExpoSpeechRecognitionModuleType). */
export type MobileJapaneseLearningDictationModule = {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  addListener(
    eventName: "start" | "end" | "result" | "error",
    listener: (event: never) => void,
  ): { remove(): void };
};

/** Web `getSpeechLang`: en → en-US, ja → ja-JP, zh → zh-CN, ko → ko-KR, else as-is. */
const SPEECH_LANGS: Record<string, string> = {
  en: "en-US",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
};

export function getMobileJapaneseLearningDictationLang(
  appLanguage: AppLanguage | string,
): string {
  return SPEECH_LANGS[appLanguage] ?? appLanguage;
}

export function buildMobileJapaneseLearningDictationOptions(
  appLanguage: AppLanguage | string,
): ExpoSpeechRecognitionOptions {
  return {
    lang: getMobileJapaneseLearningDictationLang(appLanguage),
    interimResults: true,
    continuous: false,
  };
}

/**
 * Web joins `event.results[i][0].transcript` — for a non-continuous session
 * that is the single in-progress result. The native event carries the current
 * result's alternatives, best first, so the best alternative is the same text.
 */
export function getMobileJapaneseLearningDictationTranscript(
  event: Pick<ExpoSpeechRecognitionResultEvent, "results"> | null | undefined,
): string | null {
  const transcript = event?.results?.[0]?.transcript;
  return typeof transcript === "string" ? transcript : null;
}

/**
 * Mirrors web's hidden-when-unsupported mic: the module must be linked into
 * this binary and report a usable recognizer.
 */
export function isMobileJapaneseLearningDictationAvailable(
  module: Pick<MobileJapaneseLearningDictationModule, "isRecognitionAvailable"> | null | undefined,
): boolean {
  if (!module || typeof module.isRecognitionAvailable !== "function") return false;
  try {
    return module.isRecognitionAvailable() === true;
  } catch {
    return false;
  }
}

/** Web action slot: send when there is text, else the mic when speech is supported. */
export function shouldShowMobileJapaneseLearningDictationButton({
  available,
  input,
}: {
  available: boolean;
  input: string;
}): boolean {
  return available && input.trim().length === 0;
}

export type MobileJapaneseLearningDictationStatus = "idle" | "listening";

export type MobileJapaneseLearningDictationAction =
  /** Mic tapped while idle (web sets listening before `start()` resolves). */
  | { type: "toggle-start" }
  /** Mic tapped while listening (web `stop()` + immediate idle). */
  | { type: "toggle-stop" }
  | { type: "permission-denied" }
  | { type: "start" }
  | { type: "end" }
  | { type: "error"; error: ExpoSpeechRecognitionErrorCode | string }
  /** Drawer hidden / language changed / unmounted (web `abort()` on cleanup). */
  | { type: "abort" };

export function reduceMobileJapaneseLearningDictationStatus(
  status: MobileJapaneseLearningDictationStatus,
  action: MobileJapaneseLearningDictationAction,
): MobileJapaneseLearningDictationStatus {
  switch (action.type) {
    case "toggle-start":
    case "start":
      return "listening";
    case "toggle-stop":
    case "permission-denied":
    case "end":
    case "error":
    case "abort":
      return "idle";
    default:
      return status;
  }
}

export type MobileJapaneseLearningDictationErrorKind =
  /** Expected session endings — nothing to report. */
  | "benign"
  /** Microphone / speech-recognition permission refused. */
  | "permission"
  /** Recognizer or locale unavailable on this device. */
  | "unavailable"
  | "failure";

/**
 * Web's `onerror` only resets the listening state; mobile does the same and
 * uses this classification for dev diagnostics.
 */
export function classifyMobileJapaneseLearningDictationError(
  error: ExpoSpeechRecognitionErrorCode | string | null | undefined,
): MobileJapaneseLearningDictationErrorKind {
  switch (error) {
    case "aborted":
    case "no-speech":
    case "speech-timeout":
      return "benign";
    case "not-allowed":
      return "permission";
    case "service-not-allowed":
    case "language-not-supported":
      return "unavailable";
    default:
      return "failure";
  }
}
