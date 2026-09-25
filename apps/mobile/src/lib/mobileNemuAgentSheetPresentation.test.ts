import { describe, expect, test } from "bun:test";
import { getMobileStrings } from "./mobileI18n";
import {
  getNemuAgentDisplayHost,
  getNemuAgentSheetPresentation,
  type NemuAgentSheetPresentationInput,
} from "./mobileNemuAgentSheetPresentation";

const strings = getMobileStrings("en");
const url = "https://reader.example.com/manga/1?__cf_chl_tk=secret#frag";

function present(input: Partial<NemuAgentSheetPresentationInput>) {
  return getNemuAgentSheetPresentation(
    { status: "waiting", url, solverSupported: true, ...input },
    strings,
  );
}

function glyphs(input: Partial<NemuAgentSheetPresentationInput>) {
  return present(input).rows.map((row) => `${row.key}:${row.glyph}`);
}

describe("getNemuAgentDisplayHost", () => {
  test("shows only the https host, never credentials, query, or fragment", () => {
    expect(getNemuAgentDisplayHost(url)).toBe("reader.example.com");
    expect(getNemuAgentDisplayHost("https://user:pw@Reader.Example.com/x")).toBe(
      "reader.example.com",
    );
    expect(getNemuAgentDisplayHost("http://reader.example.com/")).toBeUndefined();
    expect(getNemuAgentDisplayHost("not a url")).toBeUndefined();
    expect(getNemuAgentDisplayHost(undefined)).toBeUndefined();
  });
});

describe("getNemuAgentSheetPresentation", () => {
  test("names the protected host in a state-neutral description", () => {
    expect(present({}).description).toBe(
      "reader.example.com is protected by Cloudflare.",
    );
    expect(present({ url: undefined }).description).toBe(
      "This source is protected by Cloudflare.",
    );
  });

  test("walks the four solve steps as native events arrive", () => {
    expect(glyphs({ status: "opening" })).toEqual([
      "open:active",
      "check:pending",
      "confirm:pending",
      "resume:pending",
    ]);
    expect(glyphs({ status: "waiting" })).toEqual([
      "open:done",
      "check:active",
      "confirm:pending",
      "resume:pending",
    ]);
    expect(glyphs({ status: "captcha", interactive: true })).toEqual([
      "open:done",
      "check:done",
      "confirm:active",
      "resume:pending",
    ]);
  });

  test("keeps the row count and a single action row fixed while solving", () => {
    for (const status of ["opening", "waiting", "captcha", "success", "failed"] as const) {
      const presentation = present({ status, failedAt: "waiting" });
      expect(presentation.rows).toHaveLength(4);
      expect(presentation.actions.length).toBeGreaterThan(0);
      expect(presentation.actions.length).toBeLessThanOrEqual(2);
    }
  });

  test("warns about the browser sheet before the human check happens", () => {
    const confirm = present({ status: "waiting" }).rows[2];
    expect(confirm.detail).toBe(strings.common.agentSheetBrowserHint);
    expect(present({ status: "captcha", interactive: true }).rows[2].detail).toBe(
      strings.common.agentSheetCaptcha,
    );
  });

  test("tells a solve that needed the user apart from one that did not", () => {
    expect(glyphs({ status: "success", interactive: true })).toEqual([
      "open:done",
      "check:done",
      "confirm:done",
      "resume:active",
    ]);
    const unattended = present({ status: "success" });
    expect(unattended.rows[2]).toMatchObject({
      glyph: "skipped",
      detail: strings.common.agentStepNotNeeded,
    });
    expect(unattended.actions).toEqual([
      { kind: "done", label: strings.common.done, emphasis: "primary" },
    ]);
  });

  test("marks the step a failure interrupted with the localized reason", () => {
    const cancelled = present({
      status: "failed",
      failedAt: "captcha",
      interactive: true,
      failureReason: "cancelled",
    });
    expect(cancelled.rows.map((row) => row.glyph)).toEqual([
      "done",
      "done",
      "failed",
      "pending",
    ]);
    expect(cancelled.rows[2].detail).toBe(strings.common.agentSheetFailedCancelled);

    const timeout = present({ status: "failed", failedAt: "waiting", failureReason: "timeout" });
    expect(timeout.rows[1]).toMatchObject({
      glyph: "failed",
      detail: strings.common.agentSheetFailedTimeout,
    });

    // No recorded step (e.g. the native call itself rejected) fails the first.
    const unknown = present({ status: "failed", failureReason: "mystery-code" });
    expect(unknown.rows[0]).toMatchObject({
      glyph: "failed",
      detail: strings.common.agentSheetFailed,
    });
    expect(present({ status: "failed", failureReason: "unsolicited-host" }).rows[0].detail).toBe(
      strings.common.agentSheetFailedUnsolicitedHost,
    );
    expect(present({ status: "failed", failureReason: "blocked-destination" }).rows[0].detail).toBe(
      strings.common.agentSheetFailedBlocked,
    );
    // The boundary could not be installed (iOS rule list, Android guard): a
    // setup failure, not the generic "couldn't solve it" line.
    expect(
      present({ status: "failed", failureReason: "rule-list-unavailable" }).rows[0].detail,
    ).toBe(strings.common.agentSheetFailedSetup);
    // Android: the WebView was never challenged, so there was nothing to
    // solve — not the misleading "did not finish in time".
    expect(
      present({ status: "failed", failedAt: "waiting", failureReason: "not-challenged" })
        .rows[1].detail,
    ).toBe(strings.common.agentSheetFailedNotChallenged);
  });

  test("an unsupported solver shows the unavailable notice, never Retry", () => {
    const unsupported = present({
      status: "failed",
      failureReason: "rule-list-unavailable",
      solverSupported: false,
    });
    expect(unsupported.rows).toHaveLength(1);
    expect(unsupported.rows[0]).toMatchObject({
      glyph: "unavailable",
      detail: strings.common.agentSheetUnavailable,
    });
    expect(unsupported.actions.map((action) => action.kind)).toEqual(["done"]);
  });

  test("offers Retry after a failure only when a solve can actually run", () => {
    expect(present({ status: "failed" }).actions.map((action) => action.kind)).toEqual([
      "cancel",
      "retry",
    ]);
    expect(
      present({ status: "failed", url: undefined }).actions.map((action) => action.kind),
    ).toEqual(["done"]);
  });

  test("in-flight states offer only Cancel", () => {
    for (const status of ["opening", "waiting", "captcha"] as const) {
      expect(present({ status }).actions).toEqual([
        { kind: "cancel", label: strings.common.cancel, emphasis: "secondary" },
      ]);
    }
  });

  test("never offers verification without the native solver", () => {
    for (const status of ["needs-verification", "failed", "waiting"] as const) {
      const presentation = present({ status, solverSupported: false });
      expect(presentation.rows).toEqual([
        {
          key: "notice",
          glyph: "unavailable",
          title: strings.common.sourceCloudflareBlocked,
          detail: strings.common.agentSheetUnavailable,
        },
      ]);
      expect(presentation.actions.map((action) => action.kind)).toEqual(["done"]);
    }
  });

  test("a report that did not auto-start explains itself and offers Verify", () => {
    const presentation = present({ status: "needs-verification" });
    expect(presentation.rows).toHaveLength(1);
    expect(presentation.rows[0].glyph).toBe("shield");
    expect(presentation.actions.map((action) => action.kind)).toEqual(["cancel", "verify"]);
    expect(
      present({ status: "needs-verification", url: undefined }).actions.map(
        (action) => action.kind,
      ),
    ).toEqual(["done"]);
  });

  test("localizes every new line in every app language", () => {
    for (const language of ["en", "zh", "ja"] as const) {
      const common = getMobileStrings(language).common;
      for (const key of [
        "agentSheetProtectedSite",
        "agentSheetProtectedSource",
        "agentStepOpen",
        "agentStepCheck",
        "agentStepConfirm",
        "agentStepResume",
        "agentStepNotNeeded",
      ] as const) {
        expect(common[key], `${language}.${key}`).toBeTruthy();
      }
      expect(common.agentSheetProtectedSite).toContain("{{site}}");
    }
  });
});
