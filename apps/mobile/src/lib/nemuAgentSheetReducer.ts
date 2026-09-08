import {
  extractMobileCloudflareUrl,
  isMobileCloudflareError,
  validateMobileCloudflareOperationalUrl,
} from "@/lib/mobileSourceErrors";
import { makeMobileSourceExecutionKey } from "@/sources/mobileSourceProfileScope";

/**
 * Nemu Agent sheet state machine for Cloudflare-classified source failures.
 *
 * iOS and Android implement the on-demand solver (`solveCloudflare`), so where
 * native reports `supportsCloudflareSolver: true` the sheet is progress UI: the
 * hook starts the solve as soon as `report-error` opens it. Where the
 * capability is false (web, or any build that fails closed) presentation code
 * must still gate every Verify/Retry affordance on the native flag and use this
 * machine only to explain the blocked source.
 *
 * This module is pure (no React, no expo, no native imports) so it can be
 * unit-tested in the bun runner without pulling in react-native. The React
 * hook in `useNemuAgentSheet.ts` layers on event subscription, haptics, and the
 * post-success auto-dismiss + retry.
 */

export type NemuAgentSheetStatus =
  | "needs-verification"
  | "opening"
  | "waiting"
  | "captcha"
  | "success"
  | "failed";

/**
 * Everything native needs beyond the challenge url. Captured when the sheet
 * opens so `verify()` can bind the solved clearance cookie to the right source
 * jar and the right User-Agent.
 */
export type NemuAgentSheetContext = {
  /** The installed source's runtime key, used as the native cookie scope. */
  sourceKey?: string;
  /** The UA the follow-up source request will send, when the error carries it. */
  userAgent?: string;
};

export type NemuAgentSheetState = {
  visible: boolean;
  status: NemuAgentSheetStatus;
  url?: string;
  /** Native cookie scope for the solve; absent means the stateless jar. */
  sourceKey?: string;
  /** Native User-Agent override; absent means the runtime default. */
  userAgent?: string;
  /**
   * Machine-readable reason from the last `nemuAidokuCfFailed`. Presentation
   * maps known codes onto localized copy and ignores anything else.
   */
  failureReason?: string;
};

export type NemuAgentSheetEventName =
  | "nemuAidokuCfSolveStart"
  | "nemuAidokuCfWaiting"
  | "nemuAidokuCfCaptcha"
  | "nemuAidokuCfSuccess"
  | "nemuAidokuCfFailed";

export type NemuAgentSheetAction =
  | { type: "report-error"; error: unknown; context?: NemuAgentSheetContext }
  | { type: "start" }
  | {
      type: "event";
      event: NemuAgentSheetEventName;
      url?: string;
      reason?: string;
    }
  | { type: "dismiss" };

export const initialNemuAgentSheetState: NemuAgentSheetState = {
  visible: false,
  status: "needs-verification",
};

const INFLIGHT_STATUSES: ReadonlySet<NemuAgentSheetStatus> = new Set([
  "opening",
  "waiting",
  "captcha",
  "success",
]);

/**
 * Whether `report-error` would actually open (or re-open) the sheet for this
 * error.
 *
 * The hook has to start the native solve from `reportError`, before the
 * reducer's own next state is readable, so it needs the same accept/ignore
 * decision the reducer makes. Without it a report the reducer drops — a late
 * duplicate during the post-success hold, most visibly — would still start a
 * solve, leaving one running with no UI attached to it.
 */
export function acceptsNemuAgentSheetReport(
  state: NemuAgentSheetState,
  error: unknown,
): boolean {
  if (!isMobileCloudflareError(error)) return false;
  return !INFLIGHT_STATUSES.has(state.status);
}

/**
 * The native cookie jar a solved clearance cookie has to land in.
 *
 * Native source HTTP is scoped by the *execution* key — the active profile
 * scope plus the canonical source key, `<profile>::<registryId>:<sourceId>`
 * (`makeMobileSourceExecutionKey`). Screens report the canonical
 * `registryId:sourceId`, so the solve must derive the execution key itself;
 * handing native the bare source key writes the cookie into a jar no source
 * request ever reads, and the retry hits the challenge again.
 *
 * Derived at solve time, not when the sheet opened, so a profile switch while
 * the sheet is up cannot bind the cookie to the previous account's jar.
 * Returns `null` for a missing key — native then uses the stateless jar.
 */
export function resolveNemuAgentSolveCookieScope(
  sourceKey: string | undefined,
  profileScope?: string,
): string | null {
  const canonical = typeof sourceKey === "string" ? sourceKey.trim() : "";
  if (!canonical) return null;
  try {
    return profileScope === undefined
      ? makeMobileSourceExecutionKey(canonical)
      : makeMobileSourceExecutionKey(canonical, profileScope);
  } catch {
    return null;
  }
}

export function shouldOfferNemuAgentVerificationAction(
  status: NemuAgentSheetStatus,
  secureVerificationAvailable: boolean,
  challengeUrlAvailable: boolean,
): boolean {
  return (
    secureVerificationAvailable &&
    challengeUrlAvailable &&
    (status === "needs-verification" || status === "failed")
  );
}

/**
 * Pure reducer. Transitions:
 * - `report-error` opens the sheet (only for Cloudflare-classified errors) in
 *   the `needs-verification` state, capturing the challenge url.
 * - `start` advances from a rest state (`needs-verification`/`failed`) into
 *   `opening`; ignored while a solve is already in-flight so a double-tap or
 *   stray event can't restart the flow.
 * - `event` maps a native lifecycle event onto the matching status, accepting
 *   only a validated HTTPS url. Terminal events (`success`/`failed`) always win.
 * - `dismiss` hides and resets the sheet.
 */
export function reduceNemuAgentSheet(
  state: NemuAgentSheetState,
  action: NemuAgentSheetAction,
): NemuAgentSheetState {
  switch (action.type) {
    case "report-error": {
      // Don't clobber an active solve — when multiple fetches on the same
      // protected source fail near-simultaneously, several catches may report
      // the same challenge. Once the user has tapped Verify (solve in-flight),
      // late-arriving reports must not reset the sheet back to
      // needs-verification. `acceptsNemuAgentSheetReport` is the single
      // definition of that rule, shared with the hook's auto-start gate.
      if (!acceptsNemuAgentSheetReport(state, action.error)) return state;
      const url = extractMobileCloudflareUrl(action.error);
      return {
        visible: true,
        status: "needs-verification",
        url,
        sourceKey: normalizeContextValue(action.context?.sourceKey),
        userAgent: normalizeContextValue(action.context?.userAgent),
      };
    }
    case "start": {
      if (!state.visible || INFLIGHT_STATUSES.has(state.status)) return state;
      return { ...state, status: "opening", failureReason: undefined };
    }
    case "event": {
      if (!state.visible) return state;
      const nextUrl = action.url
        ? (validateMobileCloudflareOperationalUrl(action.url) ?? state.url)
        : state.url;
      switch (action.event) {
        case "nemuAidokuCfSolveStart":
          if (state.status !== "opening") return state;
          return { ...state, status: "waiting", url: nextUrl };
        case "nemuAidokuCfWaiting":
          if (state.status !== "opening" && state.status !== "waiting") return state;
          return { ...state, status: "waiting", url: nextUrl };
        case "nemuAidokuCfCaptcha":
          if (
            state.status !== "opening" &&
            state.status !== "waiting" &&
            state.status !== "captcha"
          ) {
            return state;
          }
          return { ...state, status: "captcha", url: nextUrl };
        case "nemuAidokuCfSuccess":
          return {
            ...state,
            status: "success",
            url: nextUrl,
            failureReason: undefined,
          };
        case "nemuAidokuCfFailed":
          if (state.status === "success") return state;
          return {
            ...state,
            status: "failed",
            url: nextUrl,
            failureReason: normalizeContextValue(action.reason),
          };
        default:
          return state;
      }
    }
    case "dismiss":
      return { visible: false, status: "needs-verification" };
    default:
      return state;
  }
}

/**
 * Native context and failure reasons are opaque strings. Keep them bounded and
 * control-character free before they reach a native argument or a rendered
 * line, and normalize blanks to `undefined`.
 */
function normalizeContextValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return undefined;
  return Array.from(trimmed).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  })
    ? undefined
    : trimmed;
}
