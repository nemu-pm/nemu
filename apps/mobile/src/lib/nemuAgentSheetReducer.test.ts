import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  makeMobileSourceExecutionKey,
  resetMobileSourceProfileScopeForTesting,
  transitionMobileSourceProfile,
} from "@/sources/mobileSourceProfileScope";
import {
  acceptsNemuAgentSheetReport,
  initialNemuAgentSheetState,
  reduceNemuAgentSheet,
  resolveNemuAgentSolveCookieScope,
  shouldOfferNemuAgentVerificationAction,
  type NemuAgentSheetState,
  type NemuAgentSheetStatus,
} from "./nemuAgentSheetReducer";

function cloudflareError(url = "https://example.test/manga"): unknown {
  const error = new Error(`Cloudflare blocked: challenge for ${url}`);
  error.name = "CloudflareBlockedError";
  return error;
}

const opened = (url?: string): NemuAgentSheetState => ({
  visible: true,
  status: "needs-verification",
  url,
});

describe("reduceNemuAgentSheet", () => {
  test("never offers verification when the native capability is unavailable", () => {
    for (const status of [
      "needs-verification",
      "opening",
      "waiting",
      "captcha",
      "success",
      "failed",
    ] as const) {
      expect(shouldOfferNemuAgentVerificationAction(status, false, true)).toBe(false);
    }
    expect(
      shouldOfferNemuAgentVerificationAction("needs-verification", true, true),
    ).toBe(true);
    expect(shouldOfferNemuAgentVerificationAction("failed", true, true)).toBe(true);
    expect(shouldOfferNemuAgentVerificationAction("waiting", true, true)).toBe(false);
    expect(
      shouldOfferNemuAgentVerificationAction("needs-verification", true, false),
    ).toBe(false);
  });

  test("starts hidden in the needs-verification state", () => {
    expect(initialNemuAgentSheetState).toEqual({
      visible: false,
      status: "needs-verification",
    });
  });

  test("opens at needs-verification with the challenge url for a cloudflare error", () => {
    const next = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError("https://protected.test/list"),
    });
    expect(next).toEqual(opened("https://protected.test/list"));
  });

  test("keeps required HTTPS challenge parameters for a capable native solver", () => {
    const url = "https://protected.test/list?ray=abc&return=%2Fread#challenge";
    const next = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError(url),
    });
    expect(next).toEqual(opened(url));
  });

  test("never captures insecure or credentialed URLs for native verification", () => {
    for (const url of [
      "http://protected.test/list?ray=abc",
      "https://user:pass@protected.test/list?ray=abc",
    ]) {
      const next = reduceNemuAgentSheet(initialNemuAgentSheetState, {
        type: "report-error",
        error: cloudflareError(url),
      });
      expect(next).toEqual(opened());
    }
  });

  test("ignores non-cloudflare errors so callers can pipe every error through", () => {
    const state = opened("https://protected.test/list");
    const next = reduceNemuAgentSheet(state, {
      type: "report-error",
      error: new Error("network request failed"),
    });
    expect(next).toBe(state);
  });

  test("opens without a url when the cloudflare error has no parseable url", () => {
    const error = new Error("cloudflare challenge detected");
    const next = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error,
    });
    expect(next.visible).toBe(true);
    expect(next.status).toBe("needs-verification");
    expect(next.url).toBeUndefined();
  });

  test("start advances from needs-verification to opening", () => {
    const next = reduceNemuAgentSheet(opened("https://x.test"), { type: "start" });
    expect(next.status).toBe("opening");
    expect(next.url).toBe("https://x.test");
  });

  test("start advances from failed to opening (retry from the failed state)", () => {
    const failed: NemuAgentSheetState = { visible: true, status: "failed", url: "https://x.test" };
    const next = reduceNemuAgentSheet(failed, { type: "start" });
    expect(next.status).toBe("opening");
  });

  test("start is ignored while a solve is in-flight", () => {
    const inFlight: NemuAgentSheetState = {
      visible: true,
      status: "waiting",
      url: "https://x.test",
    };
    expect(reduceNemuAgentSheet(inFlight, { type: "start" })).toBe(inFlight);
  });

  test("a late report-error does not reset an in-flight solve", () => {
    const waiting: NemuAgentSheetState = {
      visible: true,
      status: "waiting",
      url: "https://x.test",
    };
    expect(
      reduceNemuAgentSheet(waiting, {
        type: "report-error",
        error: cloudflareError("https://x.test"),
      }),
    ).toBe(waiting);
  });

  test("start is ignored when the sheet is hidden", () => {
    expect(
      reduceNemuAgentSheet(initialNemuAgentSheetState, { type: "start" }),
    ).toBe(initialNemuAgentSheetState);
  });

  test("start event transitions opening -> waiting and keeps the url", () => {
    const opening: NemuAgentSheetState = { visible: true, status: "opening", url: "https://x.test" };
    const next = reduceNemuAgentSheet(opening, {
      type: "event",
      event: "nemuAidokuCfSolveStart",
      url: "https://x.test",
    });
    expect(next).toEqual({ visible: true, status: "waiting", url: "https://x.test" });
  });

  test("native events cannot replace a validated challenge URL with an unsafe one", () => {
    const opening: NemuAgentSheetState = {
      visible: true,
      status: "opening",
      url: "https://x.test/challenge?ray=abc",
    };
    const next = reduceNemuAgentSheet(opening, {
      type: "event",
      event: "nemuAidokuCfSolveStart",
      url: "https://user:pass@private.test/challenge",
    });
    expect(next).toEqual({
      visible: true,
      status: "waiting",
      url: "https://x.test/challenge?ray=abc",
    });
  });

  test("waiting event is idempotent from the waiting state", () => {
    const waiting: NemuAgentSheetState = { visible: true, status: "waiting", url: "https://x.test" };
    expect(
      reduceNemuAgentSheet(waiting, { type: "event", event: "nemuAidokuCfWaiting", url: "https://x.test" }),
    ).toEqual(waiting);
  });

  test("captcha event transitions waiting -> captcha", () => {
    const waiting: NemuAgentSheetState = { visible: true, status: "waiting", url: "https://x.test" };
    const next = reduceNemuAgentSheet(waiting, {
      type: "event",
      event: "nemuAidokuCfCaptcha",
    });
    expect(next).toEqual({ visible: true, status: "captcha", url: "https://x.test" });
  });

  test("success event is terminal from any in-flight state", () => {
    const waiting: NemuAgentSheetState = { visible: true, status: "waiting", url: "https://x.test" };
    const next = reduceNemuAgentSheet(waiting, {
      type: "event",
      event: "nemuAidokuCfSuccess",
    });
    expect(next).toEqual({ visible: true, status: "success", url: "https://x.test" });
  });

  test("failed event transitions to failed from waiting", () => {
    const waiting: NemuAgentSheetState = { visible: true, status: "waiting", url: "https://x.test" };
    const next = reduceNemuAgentSheet(waiting, {
      type: "event",
      event: "nemuAidokuCfFailed",
    });
    expect(next).toEqual({ visible: true, status: "failed", url: "https://x.test" });
  });

  test("failed event cannot override an already-success state", () => {
    const success: NemuAgentSheetState = { visible: true, status: "success", url: "https://x.test" };
    expect(
      reduceNemuAgentSheet(success, { type: "event", event: "nemuAidokuCfFailed" }),
    ).toBe(success);
  });

  test("events are ignored when the sheet is hidden", () => {
    expect(
      reduceNemuAgentSheet(initialNemuAgentSheetState, {
        type: "event",
        event: "nemuAidokuCfSuccess",
      }),
    ).toBe(initialNemuAgentSheetState);
  });

  test("dismiss hides and resets to needs-verification", () => {
    const failed: NemuAgentSheetState = { visible: true, status: "failed", url: "https://x.test" };
    expect(reduceNemuAgentSheet(failed, { type: "dismiss" })).toEqual({
      visible: false,
      status: "needs-verification",
    });
  });

  test("captures the native solve context when the sheet opens", () => {
    const state = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError("https://x.test/manga"),
      context: { sourceKey: "aidoku:demo.source", userAgent: "Mozilla/5.0 (test)" },
    });
    expect(state.visible).toBe(true);
    expect(state.sourceKey).toBe("aidoku:demo.source");
    expect(state.userAgent).toBe("Mozilla/5.0 (test)");
  });

  test("drops blank, oversized, and control-bearing context values", () => {
    const state = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError("https://x.test/manga"),
      context: { sourceKey: "   ", userAgent: "Mozilla\n5.0" },
    });
    expect(state.sourceKey).toBeUndefined();
    expect(state.userAgent).toBeUndefined();

    const oversized = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError("https://x.test/manga"),
      context: { sourceKey: "a".repeat(513) },
    });
    expect(oversized.sourceKey).toBeUndefined();
  });

  test("records the native failure reason and clears it on the next start", () => {
    let state = reduceNemuAgentSheet(opened("https://x.test/manga"), {
      type: "event",
      event: "nemuAidokuCfFailed",
      reason: "cancelled",
    });
    expect(state.status).toBe("failed");
    expect(state.failureReason).toBe("cancelled");

    state = reduceNemuAgentSheet(state, { type: "start" });
    expect(state.status).toBe("opening");
    expect(state.failureReason).toBeUndefined();

    state = reduceNemuAgentSheet(state, {
      type: "event",
      event: "nemuAidokuCfSuccess",
    });
    expect(state.failureReason).toBeUndefined();
  });

  test("keeps the solve context across the whole lifecycle", () => {
    let state = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError("https://x.test/manga"),
      context: { sourceKey: "aidoku:demo.source" },
    });
    state = reduceNemuAgentSheet(state, { type: "start" });
    state = reduceNemuAgentSheet(state, {
      type: "event",
      event: "nemuAidokuCfSolveStart",
    });
    state = reduceNemuAgentSheet(state, {
      type: "event",
      event: "nemuAidokuCfCaptcha",
    });
    expect(state.sourceKey).toBe("aidoku:demo.source");
    state = reduceNemuAgentSheet(state, { type: "dismiss" });
    expect(state.sourceKey).toBeUndefined();
  });

  test("full lifecycle: error -> start -> waiting -> captcha -> success", () => {
    let state = reduceNemuAgentSheet(initialNemuAgentSheetState, {
      type: "report-error",
      error: cloudflareError("https://x.test"),
    });
    state = reduceNemuAgentSheet(state, { type: "start" });
    expect(state.status).toBe("opening");
    state = reduceNemuAgentSheet(state, {
      type: "event",
      event: "nemuAidokuCfSolveStart",
      url: "https://x.test",
    });
    expect(state.status).toBe("waiting");
    state = reduceNemuAgentSheet(state, { type: "event", event: "nemuAidokuCfCaptcha" });
    expect(state.status).toBe("captcha");
    state = reduceNemuAgentSheet(state, { type: "event", event: "nemuAidokuCfSuccess" });
    expect(state.status).toBe("success");
    state = reduceNemuAgentSheet(state, { type: "dismiss" });
    expect(state.visible).toBe(false);
  });
});

/**
 * `reportError` starts the native solve itself, before the reducer's own next
 * state is readable. Gating that on the same predicate the reducer uses is
 * what keeps a dropped report — a duplicate arriving during the post-success
 * hold, say — from leaving a solve running with no sheet attached to it.
 */
describe("acceptsNemuAgentSheetReport", () => {
  test("rejects anything that is not Cloudflare-classified", () => {
    expect(
      acceptsNemuAgentSheetReport(initialNemuAgentSheetState, new Error("boom")),
    ).toBe(false);
    expect(acceptsNemuAgentSheetReport(initialNemuAgentSheetState, null)).toBe(
      false,
    );
    expect(
      acceptsNemuAgentSheetReport(initialNemuAgentSheetState, cloudflareError()),
    ).toBe(true);
  });

  test("rejects a report while a solve is in flight or holding success", () => {
    const inFlight: NemuAgentSheetStatus[] = [
      "opening",
      "waiting",
      "captcha",
      "success",
    ];
    for (const status of inFlight) {
      expect(
        acceptsNemuAgentSheetReport(
          { ...opened(), status },
          cloudflareError(),
        ),
        status,
      ).toBe(false);
    }
    for (const status of ["needs-verification", "failed"] as const) {
      expect(
        acceptsNemuAgentSheetReport(
          { ...opened(), status },
          cloudflareError(),
        ),
        status,
      ).toBe(true);
    }
  });

  test("agrees with the reducer on every status", () => {
    const statuses: NemuAgentSheetStatus[] = [
      "needs-verification",
      "opening",
      "waiting",
      "captcha",
      "success",
      "failed",
    ];
    for (const status of statuses) {
      for (const error of [cloudflareError(), new Error("boom")]) {
        const state: NemuAgentSheetState = { ...opened(), status };
        const next = reduceNemuAgentSheet(state, {
          type: "report-error",
          error,
        });
        expect(acceptsNemuAgentSheetReport(state, error), status).toBe(
          next !== state,
        );
      }
    }
  });

  test("the hook gates its auto-start on the predicate", () => {
    const hook = readFileSync(
      path.join(import.meta.dir, "useNemuAgentSheet.ts"),
      "utf8",
    );

    expect(hook).toContain(
      "const accepted = acceptsNemuAgentSheetReport(stateRef.current, error);",
    );
    expect(hook).toContain("accepted &&\n        !solveInFlightRef.current");
    // The gate is only useful if the ref actually tracks the reducer state.
    expect(hook).toContain("stateRef.current = state;");
    const gateIndex = hook.indexOf("const accepted = acceptsNemuAgentSheetReport(");
    const solveIndex = hook.indexOf("if (url) startSolve(url, context);");
    expect(gateIndex).toBeGreaterThan(0);
    expect(solveIndex).toBeGreaterThan(gateIndex);
  });
});

/**
 * A solved clearance cookie is only useful in the jar the retried source
 * request actually reads, which is the profile-scoped execution key.
 */
describe("resolveNemuAgentSolveCookieScope", () => {
  afterEach(async () => {
    await resetMobileSourceProfileScopeForTesting();
  });

  test("scopes the canonical source key to the active profile", () => {
    expect(resolveNemuAgentSolveCookieScope("aidoku-community:en.example")).toBe(
      makeMobileSourceExecutionKey("aidoku-community:en.example"),
    );
    expect(resolveNemuAgentSolveCookieScope("aidoku-community:en.example")).toBe(
      "local::aidoku-community:en.example",
    );
  });

  test("follows the profile in effect at solve time", async () => {
    await transitionMobileSourceProfile("user-42");

    expect(resolveNemuAgentSolveCookieScope("aidoku-community:en.example")).toBe(
      "user-42::aidoku-community:en.example",
    );
  });

  test("honours an explicit profile scope", () => {
    expect(
      resolveNemuAgentSolveCookieScope("registry:source", "user-7"),
    ).toBe("user-7::registry:source");
  });

  test("falls back to the stateless jar without a source key", () => {
    expect(resolveNemuAgentSolveCookieScope(undefined)).toBeNull();
    expect(resolveNemuAgentSolveCookieScope("")).toBeNull();
    expect(resolveNemuAgentSolveCookieScope("   ")).toBeNull();
  });

  test("the hook hands native the derived scope, never the bare source key", () => {
    const hook = readFileSync(
      path.join(import.meta.dir, "useNemuAgentSheet.ts"),
      "utf8",
    );

    expect(hook).toContain(
      "cookieScope: resolveNemuAgentSolveCookieScope(context?.sourceKey),",
    );
    expect(hook).not.toContain("cookieScope: context?.sourceKey ?? null,");
    // `verify()` must reach the same call, so the state's source key is
    // scoped identically to the auto-start's.
    expect(hook).toContain(
      "startSolve(url, { sourceKey: state.sourceKey, userAgent: state.userAgent });",
    );
  });
});
