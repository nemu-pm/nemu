/**
 * Web `auth-gate.ts` (`getAuthGateStatus` / `requireAuthOrPrompt`) and the
 * 401 branch of web Nemu Chat's `streamChat` (chat/service.ts), as pure
 * rules the reader applies. Kept free of the auth client so tests import it.
 */

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
 * Web `streamChat` on a 401: the error bubble's copy, and whether sign-in is
 * prompted as well (not while the session is still loading).
 */
export function resolveMobileJapaneseLearningChatSignInFailure(
  pending: boolean,
  signInError: string,
): { message: string; promptSignIn: boolean } {
  return pending
    ? { message: MOBILE_JAPANESE_LEARNING_CHAT_AUTH_LOADING_ERROR, promptSignIn: false }
    : { message: signInError, promptSignIn: true };
}

/**
 * Which surface the sign-in sheet presents from. An iOS sheet can only be
 * presented by the topmost one, so it stacks on the open chat, else on the
 * open sentence sheet; Android's sheets are their own windows and stack from
 * the reader.
 */
export type MobileJapaneseLearningSignInHost = "chat" | "sentence" | "reader";

export function resolveMobileJapaneseLearningSignInHost({
  platform,
  chatVisible,
  sentenceVisible,
}: {
  platform: string;
  chatVisible: boolean;
  sentenceVisible: boolean;
}): MobileJapaneseLearningSignInHost {
  if (platform !== "ios") return "reader";
  if (chatVisible) return "chat";
  if (sentenceVisible) return "sentence";
  return "reader";
}
