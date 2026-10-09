/**
 * Sign-in gate for Japanese Learning (owner rule: features that run on the
 * device work signed out; features that use nemu's servers need sign-in).
 *
 * On-device: OCR (Core ML / Vision), ichiran analysis + dictionary pack
 * (downloaded from GitHub), transcript, sentence / word details, copy.
 * Server: Nemu Chat, Listen (TTS), cloud OCR (ocr.nemu.pm), cloud analysis
 * (Convex normalize + ichiran API) and the online OCR assist.
 *
 * Signed out, server features fail before any request with
 * `MobileJapaneseLearningSignInRequiredError` (message `auth_required`, the
 * same message a server 401 maps to), which the reader turns into a
 * sign-in prompt — web's `requireAuthOrPrompt`.
 */
import { useMemo } from "react";
import { mobileAuthClient } from "@/sync/mobileAuthClient";

export const MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED = "auth_required";

export class MobileJapaneseLearningSignInRequiredError extends Error {
  readonly code = "E_AUTH_REQUIRED";
  constructor() {
    super(MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED);
    this.name = "MobileJapaneseLearningSignInRequiredError";
  }
}

export function isMobileJapaneseLearningSignInRequiredError(error: unknown): boolean {
  return error instanceof Error && error.message === MOBILE_JAPANESE_LEARNING_AUTH_REQUIRED;
}

/**
 * Whether a Better Auth cookie header carries a session token (`nemu.session_token`,
 * `__Secure-nemu.session_token`). Other cookies (OAuth state, a cached JWT)
 * outlive or precede a session, so they do not count as signed in.
 */
export function hasMobileAuthSessionCookie(cookie: string | null | undefined): boolean {
  if (!cookie) return false;
  return cookie.split(";").some((part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return false;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return /(^|[._-])session_token$/.test(name) && value.length > 0;
  });
}

function readMobileAuthClientCookie(): string {
  try {
    return (
      (mobileAuthClient as unknown as { getCookie?: () => string }).getCookie?.() ?? ""
    );
  } catch {
    return "";
  }
}

let cookieReaderOverride: (() => string) | undefined;

/** Tests inject the cookie jar; `undefined` restores the auth client's. */
export function setMobileJapaneseLearningAuthCookieReaderForTesting(
  reader: (() => string) | undefined,
): void {
  cookieReaderOverride = reader;
}

/** The auth cookie header for server requests (`Better-Auth-Cookie`). */
export function getMobileJapaneseLearningAuthCookie(): string {
  return (cookieReaderOverride ?? readMobileAuthClientCookie)();
}

export function isMobileJapaneseLearningSignedIn(): boolean {
  return hasMobileAuthSessionCookie(getMobileJapaneseLearningAuthCookie());
}

/** Throws the sign-in error before a server request is made signed out. */
export function assertMobileJapaneseLearningSignedIn(
  signedIn: boolean = isMobileJapaneseLearningSignedIn(),
): void {
  if (!signedIn) throw new MobileJapaneseLearningSignInRequiredError();
}

/**
 * Render-time sign-in state for settings UI: re-renders when the Better Auth
 * session changes, and answers with the same cookie check the gates use.
 */
export function useMobileJapaneseLearningSignedIn(): boolean {
  const { data: session, isPending } = mobileAuthClient.useSession();
  return useMemo(
    () => isMobileJapaneseLearningSignedIn(),
    // The session atom is the change signal; the cookie is the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, isPending],
  );
}
