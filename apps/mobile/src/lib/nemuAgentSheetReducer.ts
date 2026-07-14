import {
  extractMobileCloudflareUrl,
  isMobileCloudflareError,
} from "@/lib/mobileSourceErrors";

/**
 * Nemu Agent sheet state machine — live Cloudflare-bypass progress.
 *
 * The inline Cloudflare solve inside the synchronous Aidoku runtime HTTP call
 * stays as a transparent fast-path (it can't be made async — that's the
 * runtime contract, and RN has no Web Workers). What this sheet drives is the
 * *on-demand* retry that runs when a source op surfaces a Cloudflare-classified
 * failure: the user taps "Verify", `NemuAidoku.solveCloudflare(url)` runs the
 * native WebView challenge flow **off the JS thread** (an Expo `AsyncFunction`
 * with a Promise — non-blocking), and emits the lifecycle events declared in
 * `NemuAidokuCfEventsMap` as it progresses. Because the solve no longer blocks
 * the JS thread, the sheet can render those events live — opening → waiting →
 * captcha → success/failed — mirroring the web Nemu Agent flow, just
 * in-process and native instead of out-of-process.
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

/**
 * Pure reducer. Transitions:
 * - `report-error` opens the sheet (only for Cloudflare-classified errors) in
 *   the `needs-verification` state, capturing the challenge url.
 * - `start` advances from a rest state (`needs-verification`/`failed`) into
 *   `opening`; ignored while a solve is already in-flight so a double-tap or
 *   stray event can't restart the flow.
 * - `event` maps a native lifecycle event onto the matching status, keeping the
 *   most recent url. Terminal events (`success`/`failed`) always win.
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
      const nextUrl = action.url ?? state.url;
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