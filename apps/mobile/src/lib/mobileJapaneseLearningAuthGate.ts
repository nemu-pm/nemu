/**
 * Web `auth-gate.ts` (`getAuthGateStatus` / `requireAuthOrPrompt`) and the
 * 401 branch of web Nemu Chat's `streamChat` (chat/service.ts), as pure
 * rules the reader applies. Kept free of the auth client so tests import it.
 */

/** `MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED`, without importing the auth client here. */
const MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED = "auth_required";

export type MobileJapaneseLearningAuthGateStatus =
  | "authenticated"
  | "loading"
  | "unauthenticated";

/** Web `streamChat` 401 while the session is still loading (untranslated on web). */
export const MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR =
  "Authentication is still loading. Please try again.";

/** Web `getAuthGateStatus`: signed in wins, then a session still loading. */
export function getMobileJapaneseLearningAuthGateStatus({
  signedIn,
  pending,
}: {
  signedIn: boolean;
  pending: boolean;
}): MobileJapaneseLearningAuthGateStatus {
  if (signedIn) return "authenticated";
  if (pending) return "loading";
  return "unauthenticated";
}

/**
 * Web `requireAuthOrPrompt`: whether the entry may go ahead, and whether to
 * show sign-in (signed out only; a session still loading just does nothing).
 */
export function resolveMobileJapaneseLearningAuthGate(
  status: MobileJapaneseLearningAuthGateStatus,
): { allowed: boolean; promptSignIn: boolean } {
  return {
    allowed: status === "authenticated",
    promptSignIn: status === "unauthenticated",
  };
}

/**
 * What every press of a server feature runs before any request or UI: true to
 * go ahead; signed out, false with the sign-in sheet requested; while the
 * session is still loading, false and nothing else.
 */
export function requireMobileJapaneseLearningAuthOrPrompt({
  signedIn,
  pending,
  promptSignIn,
}: {
  signedIn: boolean;
  pending: boolean;
  promptSignIn: () => void;
}): boolean {
  const gate = resolveMobileJapaneseLearningAuthGate(
    getMobileJapaneseLearningAuthGateStatus({ signedIn, pending }),
  );
  if (gate.promptSignIn) promptSignIn();
  return gate.allowed;
}

/**
 * Nemu Chat on a 401: web's loading bubble while the session is still loading,
 * otherwise no bubble (sign-in isn't a reply) and the sign-in sheet.
 */
export function resolveMobileJapaneseLearningChatSignInFailure(
  pending: boolean,
): { message: string | null; promptSignIn: boolean } {
  return pending
    ? { message: MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR, promptSignIn: false }
    : { message: null, promptSignIn: true };
}

/**
 * Which surface the sign-in sheet presents from. An iOS sheet can only be
 * presented by the topmost one, so it stacks on the open chat, else on the
 * open sentence sheet or transcript; Android's sheets are their own windows
 * and stack from the reader.
 */
export type MobileJapaneseLearningSignInHost = "chat" | "sentence" | "transcript" | "reader";

export function resolveMobileJapaneseLearningSignInHost({
  platform,
  chatVisible,
  sentenceVisible,
  transcriptVisible = false,
}: {
  platform: string;
  chatVisible: boolean;
  sentenceVisible: boolean;
  transcriptVisible?: boolean;
}): MobileJapaneseLearningSignInHost {
  if (platform !== "ios") return "reader";
  if (chatVisible) return "chat";
  if (sentenceVisible) return "sentence";
  if (transcriptVisible) return "transcript";
  return "reader";
}

/**
 * A recognition or analysis run stopped only because it needs sign-in (the
 * reader stores `auth_required` as the detail). It reads as a notice with a
 * Sign In action, and runs again once a session exists.
 */
export function mobileJapaneseLearningAwaitsSignIn(state: {
  status: string;
  detail?: string;
}): boolean {
  return state.status === "error" && state.detail === MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED;
}
