import {
  extractMobileCloudflareUrl,
  isMobileCloudflareError,
  validateMobileCloudflareOperationalUrl,
} from "@/lib/mobileSourceErrors";

/**
 * Nemu Agent sheet state machine for Cloudflare-classified source failures.
 *
 * The lifecycle can represent a future native verification implementation,
 * but the current iOS and Android builds report that capability as unavailable.
 * Presentation code must therefore gate every Verify/Retry affordance on the
 * explicit native flag and use this state machine only to explain the blocked
 * source until such a capability exists.
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

export type NemuAgentSheetState = {
  visible: boolean;
  status: NemuAgentSheetStatus;
  url?: string;
};

export type NemuAgentSheetEventName =
  | "nemuAidokuCfSolveStart"
  | "nemuAidokuCfWaiting"
  | "nemuAidokuCfCaptcha"
  | "nemuAidokuCfSuccess"
  | "nemuAidokuCfFailed";

export type NemuAgentSheetAction =
  | { type: "report-error"; error: unknown }
  | { type: "start" }
  | { type: "event"; event: NemuAgentSheetEventName; url?: string }
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
      if (!isMobileCloudflareError(action.error)) return state;
      // Don't clobber an active solve — when multiple fetches on the same
      // protected source fail near-simultaneously, several catches may report
      // the same challenge. Once the user has tapped Verify (solve in-flight),
      // late-arriving reports must not reset the sheet back to needs-verification.
      if (INFLIGHT_STATUSES.has(state.status)) return state;
      const url = extractMobileCloudflareUrl(action.error);
      return { visible: true, status: "needs-verification", url };
    }
    case "start": {
      if (!state.visible || INFLIGHT_STATUSES.has(state.status)) return state;
      return { ...state, status: "opening" };
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
          return { ...state, status: "success", url: nextUrl };
        case "nemuAidokuCfFailed":
          if (state.status === "success") return state;
          return { ...state, status: "failed", url: nextUrl };
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
