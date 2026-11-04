import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { isSelfHostedError } from "./http";
import type { SelfHostedKind, ServerUrlResult } from "./policy";

const KIND_NAMES: Record<SelfHostedKind, string> = {
  komga: "Komga",
  kavita: "Kavita",
  suwayomi: "Suwayomi",
};

export function selfHostedKindName(kind: SelfHostedKind): string {
  return KIND_NAMES[kind];
}

export function serverUrlErrorMessage(
  reason: Extract<ServerUrlResult, { ok: false }>["reason"],
  strings: MobileStrings,
): string {
  const text = strings.selfHosted;
  switch (reason) {
    case "empty":
      return text.errorAddressEmpty;
    case "scheme":
      return text.errorAddressScheme;
    case "credentials":
      return text.errorAddressCredentials;
    case "unreachable-host":
      return text.errorAddressLocal;
    case "invalid":
      return text.errorAddressInvalid;
  }
}

/** The user-facing sentence for a failure talking to a server. */
export function selfHostedErrorMessage(error: unknown, strings: MobileStrings, kind: SelfHostedKind): string {
  const text = strings.selfHosted;
  if (!isSelfHostedError(error)) return text.errorUnreachable;
  switch (error.code) {
    case "unauthorized":
      return text.errorUnauthorized;
    case "forbidden":
      return text.errorForbidden;
    case "not-found":
    case "invalid-response":
      return formatMobileString(text.errorNotThisServer, { kind: KIND_NAMES[kind] });
    case "server":
      return formatMobileString(text.errorServer, { status: String(error.status ?? "") });
    case "unsupported":
      return text.errorUnsupported;
    case "unreachable":
      return text.errorUnreachable;
  }
}

/**
 * The system's own words for a connection that failed ("Connection refused",
 * "timed out", ...), shown under the localized sentence so a user can tell a
 * wrong port from a wrong network. Only for failures to reach the server;
 * other codes already say everything.
 */
export function selfHostedErrorDiagnostic(error: unknown): string | null {
  // Anything that is not one of ours (a native bridge failure, say) has no
  // localized sentence of its own, so its text is all there is to show.
  if (isSelfHostedError(error) && error.code !== "unreachable") return null;
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail && detail !== "unreachable" ? detail.slice(0, 240) : null;
}
