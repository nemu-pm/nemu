import { describe, expect, test } from "bun:test";
import {
  initialNemuAgentSheetState,
  reduceNemuAgentSheet,
  type NemuAgentSheetState,
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