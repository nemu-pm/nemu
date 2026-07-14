import { useCallback, useEffect, useReducer, useRef } from "react";
import { useEventListener } from "expo";
import NemuAidoku from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import { hapticConfirm, hapticError, hapticSelection } from "@/lib/haptics";
import { isMobileCloudflareError } from "@/lib/mobileSourceErrors";
import {
  initialNemuAgentSheetState,
  reduceNemuAgentSheet,
  type NemuAgentSheetStatus,
} from "@/lib/nemuAgentSheetReducer";

/**
 * Nemu Agent sheet state machine for Cloudflare-classified failures. Embedded
 * mobile verification is capability-gated and fails closed because a WebView
 * cannot enforce the source-network SSRF boundary for every subresource.
 *
 * The pure reducer lives in `nemuAgentSheetReducer.ts` (unit-tested without a
 * React host); this hook layers on the native event subscription, haptics, and
 * the post-success auto-dismiss + retry.
 */

export type UseNemuAgentSheetOptions = {
  /** Invoked after the sheet auto-dismisses on success so the caller can
   * re-run the source operation that hit the Cloudflare challenge. */
  onSuccess?: () => void;
  /** ms to hold the success state before auto-dismiss + `onSuccess`. */
  successHoldMs?: number;
};

export type NemuAgentSheetController = {
  visible: boolean;
  status: NemuAgentSheetStatus;
  url?: string;
  /** Feed a source error through; opens the sheet only if it is
   * Cloudflare-classified. Returns true when the error was handled here. */
  reportError: (error: unknown) => boolean;
  /** Kick off the on-demand native solve (the "Verify" action). No-op if no
   * challenge url is known or a solve is already in-flight. */
  verify: () => void;
  /** Alias for `verify` — the recovery action from the `failed` state. */
  retry: () => void;
  dismiss: () => void;
};

export function useNemuAgentSheet(
  options: UseNemuAgentSheetOptions = {},
): NemuAgentSheetController {
  const successHoldMs = options.successHoldMs ?? 1200;
  const [state, dispatch] = useReducer(reduceNemuAgentSheet, initialNemuAgentSheetState);

  // Keep the latest onSuccess in a ref (synced in an effect, not during
  // render) so the stable success-timeout effect always calls the current
  // callback without re-arming when its identity changes.
  const onSuccessRef = useRef(options.onSuccess);
  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
  });

  useEventListener(
    NemuAidoku,
    "nemuAidokuCfSolveStart",
    useCallback((payload: { url?: string } | undefined) => {
      dispatch({ type: "event", event: "nemuAidokuCfSolveStart", url: payload?.url });
    }, []),
  );
  useEventListener(
    NemuAidoku,
    "nemuAidokuCfWaiting",
    useCallback((payload: { url?: string } | undefined) => {
      dispatch({ type: "event", event: "nemuAidokuCfWaiting", url: payload?.url });
    }, []),
  );
  useEventListener(
    NemuAidoku,
    "nemuAidokuCfCaptcha",
    useCallback((payload: { url?: string } | undefined) => {
      void hapticSelection();
      dispatch({ type: "event", event: "nemuAidokuCfCaptcha", url: payload?.url });
    }, []),
  );
  useEventListener(
    NemuAidoku,
    "nemuAidokuCfSuccess",
    useCallback((payload: { url?: string } | undefined) => {
      void hapticConfirm();
      dispatch({ type: "event", event: "nemuAidokuCfSuccess", url: payload?.url });
    }, []),
  );
  useEventListener(
    NemuAidoku,
    "nemuAidokuCfFailed",
    useCallback((payload: { url?: string } | undefined) => {
      void hapticError();
      dispatch({ type: "event", event: "nemuAidokuCfFailed", url: payload?.url });
    }, []),
  );

  // Hold the success state briefly so the user sees the confirmation, then
  // auto-dismiss and let the caller retry the blocked source operation with
  // the fresh cf_clearance cookie.
  useEffect(() => {
    if (state.status !== "success") return;
    const id = setTimeout(() => {
      dispatch({ type: "dismiss" });
      onSuccessRef.current?.();
    }, successHoldMs);
    return () => clearTimeout(id);
  }, [state.status, successHoldMs]);

  const reportError = useCallback((error: unknown) => {
    if (!isMobileCloudflareError(error)) return false;
    dispatch({ type: "report-error", error });
    return true;
  }, []);

  const verify = useCallback(() => {
    const url = state.url;
    if (!url) return;
    try {
      if (NemuAidoku.getHttpClientStatus().supportsCloudflareSolver !== true) {
        void hapticError();
        dispatch({ type: "event", event: "nemuAidokuCfFailed", url });
        return;
      }
    } catch {
      void hapticError();
      dispatch({ type: "event", event: "nemuAidokuCfFailed", url });
      return;
    }
    dispatch({ type: "start" });
    // Fire-and-forget: native events drive the rest. Catch to avoid unhandled
    // rejections (solver unavailable, web shim, etc.) and surface as failed.
    NemuAidoku.solveCloudflare(url).catch(() => {
      dispatch({ type: "event", event: "nemuAidokuCfFailed", url });
    });
  }, [state.url]);

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), []);

  return {
    visible: state.visible,
    status: state.status,
    url: state.url,
    reportError,
    verify,
    retry: verify,
    dismiss,
  };
}
