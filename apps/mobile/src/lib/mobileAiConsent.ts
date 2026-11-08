import { SecureNativeKVStore } from "@/data/nativeKV";

/**
 * One-time notice before nemu sends content to a third-party AI service
 * (App Review 5.1.2(i)). Every AI call path goes through
 * `requireMobileAiConsent()` right before it touches the network:
 *   - Nemu chat            (mobileJapaneseLearningChat.ts, /nemu-chat)
 *   - Listen / TTS         (mobileJapaneseLearningTts.ts, /tts)
 *   - Japanese clean-up    (mobileJapaneseLearningGrammar.ts, japanese_learning.normalize)
 *   - Smart metadata match (mobileMetadataMatch.ts, ai_metadata.*)
 * On-device OCR/analysis and nemu's own OCR host do not need it.
 * Bump MOBILE_AI_CONSENT_VERSION when the privacy policy changes in a way that
 * should be re-asked.
 */
export const MOBILE_AI_CONSENT_VERSION = 1;
export const MOBILE_PRIVACY_POLICY_URL = "https://nemu.pm/privacy";
export const MOBILE_AI_CONSENT_KEY = "nemu.ai-consent";

export class MobileAiConsentDeclinedError extends Error {
  readonly code = "E_AI_CONSENT_DECLINED";
  constructor() {
    super("ai_consent_declined");
    this.name = "MobileAiConsentDeclinedError";
  }
}

export function isMobileAiConsentDeclinedError(error: unknown): boolean {
  return error instanceof MobileAiConsentDeclinedError;
}

type Store = { getString(key: string): Promise<string | null>; setString(key: string, value: string): Promise<void> };
type Presenter = () => Promise<boolean>;

let store: Store = new SecureNativeKVStore();
let presenter: Presenter | null = null;
let pending: Promise<boolean> | null = null;

/** The root sheet host registers itself here; returns an unregister function. */
export function registerMobileAiConsentPresenter(next: Presenter): () => void {
  presenter = next;
  return () => {
    if (presenter === next) presenter = null;
  };
}

export function setMobileAiConsentStoreForTesting(next: Store | null, version?: number): void {
  store = next ?? new SecureNativeKVStore();
  pending = null;
  void version;
}

export async function hasMobileAiConsent(): Promise<boolean> {
  try {
    const raw = await store.getString(MOBILE_AI_CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "number" && parsed.version >= MOBILE_AI_CONSENT_VERSION;
  } catch {
    return false;
  }
}

async function record(): Promise<void> {
  await store.setString(
    MOBILE_AI_CONSENT_KEY,
    JSON.stringify({ version: MOBILE_AI_CONSENT_VERSION, acceptedAt: Date.now() }),
  );
}

/**
 * Resolves when the user has consented (now or earlier); throws
 * MobileAiConsentDeclinedError when they decline, cancelling only the caller's
 * action: the sheet is shown again next time. Concurrent callers share one sheet.
 */
export async function requireMobileAiConsent(): Promise<void> {
  if (await hasMobileAiConsent()) return;
  if (!presenter) throw new MobileAiConsentDeclinedError();
  pending ??= presenter().finally(() => {
    pending = null;
  });
  const accepted = await pending;
  if (!accepted) throw new MobileAiConsentDeclinedError();
  try {
    await record();
  } catch {
    // Storage failure: allow this action, ask again next time.
  }
}
