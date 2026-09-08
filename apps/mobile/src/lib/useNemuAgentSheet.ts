import { useCallback, useEffect, useReducer, useRef } from "react";
import { useEventListener } from "expo";
import NemuAidoku from "../../modules/nemu-aidoku/src/NemuAidokuModule";
import { hapticConfirm, hapticError, hapticSelection } from "@/lib/haptics";
import { markMobilePerformance } from "@/lib/mobilePerformance";
import {
  extractMobileCloudflareUrl,
  isMobileCloudflareError,
  validateMobileCloudflareOperationalUrl,
} from "@/lib/mobileSourceErrors";
import {
  acceptsNemuAgentSheetReport,
  initialNemuAgentSheetState,
  reduceNemuAgentSheet,
  resolveNemuAgentSolveCookieScope,
  type NemuAgentSheetContext,
  type NemuAgentSheetStatus,
} from "@/lib/nemuAgentSheetReducer";

/**
 * Nemu Agent sheet state machine for Cloudflare-classified failures.
 *
 * Native verification is capability-gated on `supportsCloudflareSolver`. iOS
 * and Android implement it (an explicit, never-inline WebView solve confined to
 * the challenge host tree), so where the flag is true the sheet is progress UI:
 * `reportError` opens it and immediately starts the solve. Where the flag is
 * false the sheet only explains the blocked source and offers no action.
 *
 * The pure reducer lives in `nemuAgentSheetReducer.ts` (unit-tested without a
 * React host). This hook adds native event subscription, haptics, the
 * post-success auto-dismiss + retry, and the native call itself.
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
  /** Machine-readable reason from the last native failure, if any. */
  failureReason?: string;
  /**
   * Feed a source error through; opens the sheet only if it is
   * Cloudflare-classified, and starts the native solve right away when the
   * platform supports it. Returns true when the error was handled here.
   *
   * `context.sourceKey` is the installed source's runtime key — the same
   * string used as the request cookie scope — so a solved clearance cookie
   * lands in the jar the retried operation will read from.
   */
  reportError: (error: unknown, context?: NemuAgentSheetContext) => boolean;
  /** Kick off the on-demand native solve (the "Verify" action). No-op if no
   * challenge url is known or a solve is already in-flight. */
  verify: () => void;
  /** Alias for `verify` — the recovery action from the `failed` state. */
  retry: () => void;
  dismiss: () => void;
};

export function supportsMobileCloudflareSolver(): boolean {
  try {
    return NemuAidoku.getHttpClientStatus().supportsCloudflareSolver === true;
  } catch {
    return false;
  }
}

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

  // Reducer state is not readable synchronously inside `reportError`, so the
  // auto-start needs its own in-flight marker: several screens reporting
  // near-simultaneously (or a second host failing mid-solve) must not stack
  // native solves behind the one sheet.
  const solveInFlightRef = useRef(false);

  // The auto-start must also see the state the reducer will judge the report
  // against, so a report the reducer drops (most visibly a late duplicate
  // during the post-success hold) cannot start a solve with no sheet attached
  // to it. Synced in an effect, like `onSuccessRef`, never during render.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
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
      solveInFlightRef.current = false;
      dispatch({ type: "event", event: "nemuAidokuCfSuccess", url: payload?.url });
    }, []),
  );
  useEventListener(
    NemuAidoku,
    "nemuAidokuCfFailed",
    useCallback((payload: { url?: string; reason?: string } | undefined) => {
      void hapticError();
      solveInFlightRef.current = false;
      // The sheet localizes only a few reasons; keep the raw code in the
      // diagnostics stream so a live failure can be traced.
      markMobilePerformance("mobile.cloudflare.solve.failed", {
        reason: payload?.reason ?? "unknown",
      });
      dispatch({
        type: "event",
        event: "nemuAidokuCfFailed",
        url: payload?.url,
        reason: payload?.reason,
      });
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

  const startSolve = useCallback(
    (url: string, context: NemuAgentSheetContext | undefined) => {
      solveInFlightRef.current = true;
      dispatch({ type: "start" });
      // Fire-and-forget: native events drive the rest. Catch to avoid unhandled
      // rejections (web shim, missing native module) and surface as failed.
      NemuAidoku.solveCloudflare(url, {
        // The jar native writes into must be the one the retried source
        // request reads from, which is the execution key, not the bare source
        // key the screens report.
        cookieScope: resolveNemuAgentSolveCookieScope(context?.sourceKey),
        userAgent: context?.userAgent ?? null,
      }).catch((error: unknown) => {
        solveInFlightRef.current = false;
        markMobilePerformance("mobile.cloudflare.solve.failed", {
          reason: "native-rejected",
          detail: error instanceof Error ? error.message : String(error),
        });
        dispatch({ type: "event", event: "nemuAidokuCfFailed", url });
      });
    },
    [],
  );

  const reportError = useCallback(
    (error: unknown, context?: NemuAgentSheetContext) => {
      if (!isMobileCloudflareError(error)) return false;
      const accepted = acceptsNemuAgentSheetReport(stateRef.current, error);
      dispatch({ type: "report-error", error, context });
      // Where the solver exists the sheet is progress UI, not a prompt: start
      // immediately rather than waiting for a tap. The reducer ignores a
      // `start` for a solve that is already in flight, so several near
      // simultaneous reports on one source still produce one solve — and a
      // report the reducer itself ignored never starts one at all.
      if (
        accepted &&
        !solveInFlightRef.current &&
        supportsMobileCloudflareSolver()
      ) {
        // The reducer's own url is not readable until the next render, so
        // recompute the same validated value the reducer captured.
        const url = extractMobileCloudflareUrl(error);
        if (url) startSolve(url, context);
      }
      return true;
    },
    [startSolve],
  );

  const verify = useCallback(() => {
    const url = state.url
      ? validateMobileCloudflareOperationalUrl(state.url)
      : undefined;
    if (!url) return;
    if (!supportsMobileCloudflareSolver()) {
      void hapticError();
      dispatch({ type: "event", event: "nemuAidokuCfFailed", url });
      return;
    }
    startSolve(url, { sourceKey: state.sourceKey, userAgent: state.userAgent });
  }, [startSolve, state.sourceKey, state.url, state.userAgent]);

  const dismiss = useCallback(() => {
    // Closing the sheet has to tear the native solve down too, otherwise a
    // hidden WebView keeps running the challenge with nothing listening.
    if (solveInFlightRef.current) {
      // Started inside a promise so a native build that predates this method
      // throws into the catch instead of out of `dismiss`.
      void Promise.resolve()
        .then(() => NemuAidoku.cancelCloudflareSolve())
        .catch(() => {});
    }
    solveInFlightRef.current = false;
    dispatch({ type: "dismiss" });
  }, []);

  return {
    visible: state.visible,
    status: state.status,
    url: state.url,
    failureReason: state.failureReason,
    reportError,
    verify,
    retry: verify,
    dismiss,
  };
}
