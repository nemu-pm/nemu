/**
 * Recognition-engine selection for Japanese Learning.
 *
 * - "auto" (default): on-device OCR (Apple Vision, iOS 18+) and on-device
 *   analysis (ichiran Rust kernel + downloadable dictionary pack) whenever the
 *   binary and OS support them; the cloud services otherwise (Android today,
 *   iOS < 18, binaries built without the vendored kernel).
 * - "onDevice": never uploads page images or text; unsupported → an error.
 * - "cloud": today's services (ocr.nemu.pm, Convex normalize, ichiran API).
 *
 * The choice is made per capability, never per failure: once a run has
 * started on-device it does not silently retry in the cloud.
 */
import NemuJapaneseLearningModule from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearningModule";
import type {
  NemuJapaneseLearningCapabilities,
  NemuJapaneseLearningNativeModule,
} from "../../modules/nemu-japanese-learning/src/NemuJapaneseLearning.types";

export type MobileJapaneseLearningEnginePreference = "auto" | "onDevice" | "cloud";
export type MobileJapaneseLearningEngineKind = "on-device" | "cloud";

export const MOBILE_JAPANESE_LEARNING_ENGINE_SETTING_KEY = "recognitionEngine";
export const MOBILE_JAPANESE_LEARNING_ENGINE_PREFERENCES: readonly MobileJapaneseLearningEnginePreference[] =
  ["auto", "onDevice", "cloud"];

export function normalizeMobileJapaneseLearningEnginePreference(
  value: unknown,
): MobileJapaneseLearningEnginePreference {
  return value === "onDevice" || value === "cloud" ? value : "auto";
}

let enginePreference: MobileJapaneseLearningEnginePreference = "auto";

/** Fed from the Japanese Learning plugin settings (see mobileHooks). */
export function setMobileJapaneseLearningEnginePreference(value: unknown): void {
  enginePreference = normalizeMobileJapaneseLearningEnginePreference(value);
}

export function getMobileJapaneseLearningEnginePreference(): MobileJapaneseLearningEnginePreference {
  return enginePreference;
}

/**
 * Opt-in "online OCR assist" (see mobileJapaneseLearningOcrAssist.ts): with
 * the automatic engine, bubbles on-device OCR read with low confidence are
 * re-read by the cloud service. Off by default; never used with the
 * on-device-only preference.
 */
export const MOBILE_JAPANESE_LEARNING_OCR_ASSIST_SETTING_KEY = "onlineOcrAssist";

let ocrAssistEnabled = false;

export function setMobileJapaneseLearningOcrAssist(value: unknown): void {
  ocrAssistEnabled = value === true;
}

/** Whether a run with this preference may send low-confidence pages to the cloud. */
export function isMobileJapaneseLearningOcrAssistActive(
  preference: MobileJapaneseLearningEnginePreference = enginePreference,
): boolean {
  return ocrAssistEnabled && preference === "auto";
}

let nativeModuleOverride: NemuJapaneseLearningNativeModule | null | undefined;

/** Tests inject a fake native module; `undefined` restores the real one. */
export function setMobileJapaneseLearningNativeModuleForTesting(
  module: NemuJapaneseLearningNativeModule | null | undefined,
): void {
  nativeModuleOverride = module;
  capabilitiesCache = undefined;
}

export function getMobileJapaneseLearningNativeModule(): NemuJapaneseLearningNativeModule | null {
  return nativeModuleOverride !== undefined
    ? nativeModuleOverride
    : NemuJapaneseLearningModule;
}

let capabilitiesCache: NemuJapaneseLearningCapabilities | null | undefined;

export function getMobileJapaneseLearningCapabilities(): NemuJapaneseLearningCapabilities | null {
  if (capabilitiesCache !== undefined) return capabilitiesCache;
  const module = getMobileJapaneseLearningNativeModule();
  try {
    capabilitiesCache = module?.getCapabilities() ?? null;
  } catch {
    capabilitiesCache = null;
  }
  return capabilitiesCache;
}

export class MobileJapaneseLearningEngineUnavailableError extends Error {
  readonly code = "E_ON_DEVICE_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "MobileJapaneseLearningEngineUnavailableError";
  }
}

export function resolveMobileJapaneseLearningOcrEngine(
  preference: MobileJapaneseLearningEnginePreference,
  capabilities: NemuJapaneseLearningCapabilities | null,
): MobileJapaneseLearningEngineKind {
  if (preference === "cloud") return "cloud";
  if (capabilities?.ocr.available) return "on-device";
  if (preference === "onDevice") {
    throw new MobileJapaneseLearningEngineUnavailableError(
      "On-device text recognition is not available on this device.",
    );
  }
  return "cloud";
}

/**
 * The analyzer counts as available when the kernel is linked: a missing
 * dictionary pack is installed on first use (a one-time download, no upload).
 */
export function resolveMobileJapaneseLearningAnalysisEngine(
  preference: MobileJapaneseLearningEnginePreference,
  capabilities: NemuJapaneseLearningCapabilities | null,
): MobileJapaneseLearningEngineKind {
  if (preference === "cloud") return "cloud";
  if (capabilities?.analysis.kernelLinked) return "on-device";
  if (preference === "onDevice") {
    throw new MobileJapaneseLearningEngineUnavailableError(
      "On-device Japanese analysis is not available in this build.",
    );
  }
  return "cloud";
}

export type MobileJapaneseLearningEngineRun = {
  stage: "ocr" | "analysis" | "pack-install";
  engine: MobileJapaneseLearningEngineKind;
  detail: string;
  durationMs: number;
  at: number;
  ok: boolean;
};

const ENGINE_RUN_LOG_LIMIT = 32;
const engineRuns: MobileJapaneseLearningEngineRun[] = [];
// Expo inlines `process.env.EXPO_PUBLIC_*` member expressions at bundle time.
const debugEnabled =
  (globalThis as { __DEV__?: boolean }).__DEV__ === true ||
  process.env.EXPO_PUBLIC_NEMU_JL_ENGINE_DEBUG === "1";

/** Records which engine served a run and how long it took (debug log). */
export function recordMobileJapaneseLearningEngineRun(
  run: Omit<MobileJapaneseLearningEngineRun, "at">,
): void {
  const entry = { ...run, at: Date.now() };
  engineRuns.push(entry);
  if (engineRuns.length > ENGINE_RUN_LOG_LIMIT) engineRuns.shift();
  if (debugEnabled) {
    console.info(
      `[japanese-learning] ${entry.stage} engine=${entry.engine} ${Math.round(entry.durationMs)}ms ${entry.ok ? "ok" : "failed"} ${entry.detail}`,
    );
  }
}

export function getMobileJapaneseLearningEngineRuns(): readonly MobileJapaneseLearningEngineRun[] {
  return engineRuns.slice();
}

export function mobileJapaneseLearningNowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

let requestSequence = 0;
export function createMobileJapaneseLearningEngineRequestId(prefix: string): string {
  requestSequence = (requestSequence + 1) % 1_000_000_000;
  return `${prefix}-${Date.now().toString(36)}-${requestSequence}`;
}
