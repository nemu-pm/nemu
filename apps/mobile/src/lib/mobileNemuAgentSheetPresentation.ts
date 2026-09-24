import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { redactMobileCloudflareUrlForDisplay } from "@/lib/mobileSourceErrors";
import {
  shouldOfferNemuAgentVerificationAction,
  type NemuAgentSheetInflightStatus,
  type NemuAgentSheetStatus,
} from "@/lib/nemuAgentSheetReducer";

/**
 * Pure presentation model for `MobileNemuAgentSheet`.
 *
 * The sheet reads like a settings card: a centered title row, one neutral
 * description, then grouped rows. While a solve runs (or after one settles)
 * the rows are the four steps of the solve, each with its own state glyph, so
 * every native event moves a glyph instead of rewriting a paragraph. When
 * there is nothing to step through (no solver, or a report that did not
 * auto-start) the card is a single explanatory row.
 *
 * The row count is fixed per mode and the footer is always one row of
 * buttons, so the dynamically sized native sheet does not change height as
 * events arrive.
 */

export type NemuAgentStepKey = "open" | "check" | "confirm" | "resume";

export type NemuAgentRowGlyph =
  | "pending"
  | "active"
  | "done"
  | "skipped"
  | "failed"
  | "shield"
  | "unavailable";

export type NemuAgentSheetRow = {
  key: NemuAgentStepKey | "notice";
  glyph: NemuAgentRowGlyph;
  title: string;
  detail?: string;
};

export type NemuAgentSheetActionKind = "cancel" | "retry" | "verify" | "done";

export type NemuAgentSheetAction = {
  kind: NemuAgentSheetActionKind;
  label: string;
  emphasis: "primary" | "secondary";
};

export type NemuAgentSheetPresentation = {
  description: string;
  rows: NemuAgentSheetRow[];
  actions: NemuAgentSheetAction[];
  /** Spoken summary for the card, since glyphs carry most of the state. */
  accessibilitySummary: string;
};

export type NemuAgentSheetPresentationInput = {
  status: NemuAgentSheetStatus;
  url?: string;
  failureReason?: string;
  interactive?: boolean;
  failedAt?: NemuAgentSheetInflightStatus;
  solverSupported: boolean;
};

const STEP_ORDER: readonly NemuAgentStepKey[] = [
  "open",
  "check",
  "confirm",
  "resume",
];

const STEP_FOR_INFLIGHT: Record<NemuAgentSheetInflightStatus, NemuAgentStepKey> = {
  opening: "open",
  waiting: "check",
  captcha: "confirm",
};

/**
 * The host a challenge url names, for display only. Credentials, query and
 * fragment are stripped by the shared redactor first; anything that does not
 * parse as an https url shows no host at all.
 */
export function getNemuAgentDisplayHost(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const redacted = redactMobileCloudflareUrlForDisplay(url);
  if (!redacted) return undefined;
  const match = /^https:\/\/([^/?#:]+)/i.exec(redacted);
  return match?.[1]?.toLowerCase();
}

/**
 * Native reports a stable reason code. Known codes get their own localized
 * line; anything else (including a code a newer native build adds) falls back
 * to the generic failure copy rather than surfacing a raw identifier.
 */
export function getNemuAgentFailureCopy(
  failureReason: string | undefined,
  strings: MobileStrings,
): string {
  switch (failureReason) {
    case "cancelled":
      return strings.common.agentSheetFailedCancelled;
    case "timeout":
      return strings.common.agentSheetFailedTimeout;
    case "blocked-destination":
    case "unsupported-url":
      return strings.common.agentSheetFailedBlocked;
    case "unsolicited-host":
      // Native refuses to solve a host the source never actually requested.
      return strings.common.agentSheetFailedUnsolicitedHost;
    default:
      return strings.common.agentSheetFailed;
  }
}

function stepTitle(key: NemuAgentStepKey, strings: MobileStrings): string {
  switch (key) {
    case "open":
      return strings.common.agentStepOpen;
    case "check":
      return strings.common.agentStepCheck;
    case "confirm":
      return strings.common.agentStepConfirm;
    case "resume":
      return strings.common.agentStepResume;
  }
}

/** Which step is current, and whether it is running, finished, or failed. */
function currentStep(
  status: NemuAgentSheetStatus,
  failedAt: NemuAgentSheetInflightStatus | undefined,
): { key: NemuAgentStepKey; state: "active" | "failed" } {
  switch (status) {
    case "opening":
    case "waiting":
    case "captcha":
      return { key: STEP_FOR_INFLIGHT[status], state: "active" };
    case "success":
      return { key: "resume", state: "active" };
    case "failed":
    default:
      return { key: failedAt ? STEP_FOR_INFLIGHT[failedAt] : "open", state: "failed" };
  }
}

function stepRows(
  input: NemuAgentSheetPresentationInput,
  strings: MobileStrings,
): NemuAgentSheetRow[] {
  const current = currentStep(input.status, input.failedAt);
  const currentIndex = STEP_ORDER.indexOf(current.key);

  return STEP_ORDER.map((key, index): NemuAgentSheetRow => {
    const title = stepTitle(key, strings);
    if (index < currentIndex) {
      // A passed human-check step either happened or was never needed.
      if (key === "confirm" && !input.interactive) {
        return { key, glyph: "skipped", title, detail: strings.common.agentStepNotNeeded };
      }
      // The host is already in the description; a finished step needs no
      // second line.
      return { key, glyph: "done", title };
    }
    if (index > currentIndex) {
      return {
        key,
        glyph: "pending",
        title,
        // Set the expectation before it happens: the browser sheet is the
        // one thing on this path that can surprise the user.
        ...(key === "confirm" && current.state === "active"
          ? { detail: strings.common.agentSheetBrowserHint }
          : {}),
      };
    }
    if (current.state === "failed") {
      return {
        key,
        glyph: "failed",
        title,
        detail: getNemuAgentFailureCopy(input.failureReason, strings),
      };
    }
    switch (key) {
      case "open":
        return { key, glyph: "active", title, detail: strings.common.agentSheetOpening };
      case "check":
        return { key, glyph: "active", title, detail: strings.common.agentSheetVerifying };
      case "confirm":
        return { key, glyph: "active", title, detail: strings.common.agentSheetCaptcha };
      case "resume":
        return { key, glyph: "active", title, detail: strings.common.agentSheetSuccess };
    }
  });
}

export function getNemuAgentSheetPresentation(
  input: NemuAgentSheetPresentationInput,
  strings: MobileStrings,
): NemuAgentSheetPresentation {
  const host = getNemuAgentDisplayHost(input.url);
  const description = host
    ? formatMobileString(strings.common.agentSheetProtectedSite, { site: host })
    : strings.common.agentSheetProtectedSource;
  const cancel: NemuAgentSheetAction = {
    kind: "cancel",
    label: strings.common.cancel,
    emphasis: "secondary",
  };
  const done = (emphasis: NemuAgentSheetAction["emphasis"]): NemuAgentSheetAction => ({
    kind: "done",
    label: strings.common.done,
    emphasis,
  });

  // Only claim "unavailable on this platform" when native really says so.
  if (!input.solverSupported) {
    const detail = strings.common.agentSheetUnavailable;
    return {
      description,
      rows: [
        {
          key: "notice",
          glyph: "unavailable",
          title: strings.common.sourceCloudflareBlocked,
          detail,
        },
      ],
      actions: [done("secondary")],
      accessibilitySummary: `${strings.common.sourceCloudflareBlocked}. ${detail}`,
    };
  }

  if (input.status === "needs-verification") {
    const canVerify = shouldOfferNemuAgentVerificationAction(
      input.status,
      input.solverSupported,
      Boolean(input.url),
    );
    const detail = strings.common.sourceCloudflareBlockedDescription;
    return {
      description,
      rows: [
        {
          key: "notice",
          glyph: "shield",
          title: strings.common.sourceCloudflareBlocked,
          detail,
        },
      ],
      actions: canVerify
        ? [cancel, { kind: "verify", label: strings.common.agentVerify, emphasis: "primary" }]
        : [done("secondary")],
      accessibilitySummary: `${strings.common.sourceCloudflareBlocked}. ${detail}`,
    };
  }

  const rows = stepRows(input, strings);
  const focus = rows.find((row) => row.glyph === "active" || row.glyph === "failed");
  const accessibilitySummary = focus
    ? [focus.title, focus.detail].filter(Boolean).join(". ")
    : description;

  let actions: NemuAgentSheetAction[];
  if (input.status === "success") {
    // Closing now just skips the short hold; the hook still retries.
    actions = [done("primary")];
  } else if (input.status === "failed") {
    actions = shouldOfferNemuAgentVerificationAction(
      input.status,
      input.solverSupported,
      Boolean(input.url),
    )
      ? [cancel, { kind: "retry", label: strings.common.retry, emphasis: "primary" }]
      : [done("secondary")];
  } else {
    actions = [cancel];
  }

  return { description, rows, actions, accessibilitySummary };
}
