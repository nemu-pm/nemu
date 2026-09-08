const MAX_SANDBOX_INPUT_JSON_CHARACTERS = 2 * 1024 * 1024;
const MAX_SANDBOX_RESPONSE_JSON_CHARACTERS = 4 * 1024 * 1024;
const MAX_SANDBOX_ERROR_NAME_LENGTH = 64;
const MAX_SANDBOX_ERROR_FIELD_LENGTH = 16 * 1024;
/**
 * A challenge URL is an operational value: the host hands it to the native
 * Cloudflare solver. Keep it far below the generic field cap, and the host
 * within the DNS name limit.
 */
const MAX_SANDBOX_ERROR_URL_LENGTH = 2048;
const MAX_SANDBOX_ERROR_HOST_LENGTH = 255;

/**
 * Error classes the sandbox envelope is allowed to rebuild.
 *
 * The isolate can only flatten a thrown error to JSON, so a typed source
 * failure (`AidokuResultError`) and a Cloudflare challenge
 * (`CloudflareBlockedError`) would otherwise arrive as an indistinguishable
 * `Error`. The list is closed: a hostile source must never be able to make the
 * host reconstruct an arbitrary error identity.
 */
const RECONSTRUCTABLE_SANDBOX_ERROR_NAMES = new Set([
  "AidokuResultError",
  "CloudflareBlockedError",
]);

type SandboxCompleteResponse = {
  status: "complete";
  value: unknown;
};

type SandboxErrorResponse = {
  status: "error";
  code?: string;
  detail?: string;
  /** Class name of a propagated error; see the allow-list above. */
  errorName?: string;
  /** `AidokuResultError.code` — the negative aidoku-rs result code. */
  errorCode?: number;
  errorUrl?: string;
  errorHost?: string;
  errorUserAgent?: string;
};

export type MobileAidokuSandboxErrorFields = Omit<
  SandboxErrorResponse,
  "status"
>;

function boundedErrorField(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SANDBOX_ERROR_FIELD_LENGTH
    ? value
    : null;
}

/**
 * The challenge URL and host a reconstructed `CloudflareBlockedError` may
 * carry, or `null` when the envelope's own fields disagree.
 *
 * Whatever survives here is what a solve can later be started from, so the two
 * fields have to describe the same origin. The URL must be HTTPS, free of
 * embedded credentials and control characters, and bounded; `errorHost` must
 * name that URL's own host (case-insensitively, with or without the port) and
 * is derived from the URL when the envelope omitted it. A mismatch — the shape
 * a compromised isolate would use to point the solver at a host the request
 * never went to — drops both fields rather than picking one, so the
 * reconstructed error cannot start a solve at all.
 */
function consistentSandboxErrorOrigin(
  fields: MobileAidokuSandboxErrorFields,
): { url: string; host: string } | null {
  const rawUrl = boundedErrorField(fields.errorUrl);
  if (!rawUrl || rawUrl.length > MAX_SANDBOX_ERROR_URL_LENGTH) return null;
  if (rawUrl !== rawUrl.trim()) return null;
  const hasUnsafeCharacter = Array.from(rawUrl).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || code === 0x7f || character === "\\";
  });
  if (hasUnsafeCharacter) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;

  const rawHost = boundedErrorField(fields.errorHost);
  if (!rawHost) return { url: rawUrl, host: url.host };
  if (rawHost.length > MAX_SANDBOX_ERROR_HOST_LENGTH) return null;
  const host = rawHost.trim().toLowerCase();
  if (host !== url.host.toLowerCase() && host !== url.hostname.toLowerCase()) {
    return null;
  }
  return { url: rawUrl, host: rawHost };
}

/**
 * Rebuild the error a sandbox operation threw.
 *
 * `name` and `code` are restored so callers can branch on the source's own
 * failure reason, and the Cloudflare fields (`url`, `host`, `userAgent`) are
 * carried across when the isolate reported them. The url/host pair is only
 * restored when the two agree on one HTTPS origin (see
 * `consistentSandboxErrorOrigin`); otherwise the error is rebuilt without
 * either, so nothing can start a native solve from it. Anything outside the
 * allow-list becomes a plain `Error` with the sanitized detail message.
 */
export function reconstructMobileAidokuSandboxError(
  fields: MobileAidokuSandboxErrorFields,
  fallbackMessage: string,
): Error {
  const detail = boundedErrorField(fields.detail);
  const error = new Error(detail ?? fallbackMessage);
  const name = boundedErrorField(fields.errorName);
  if (
    !name ||
    name.length > MAX_SANDBOX_ERROR_NAME_LENGTH ||
    !RECONSTRUCTABLE_SANDBOX_ERROR_NAMES.has(name)
  ) {
    return error;
  }
  error.name = name;
  if (typeof fields.errorCode === "number" && Number.isSafeInteger(fields.errorCode)) {
    Object.defineProperty(error, "code", {
      value: fields.errorCode,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  const defineErrorProperty = (property: string, value: string) => {
    Object.defineProperty(error, property, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };
  const origin = consistentSandboxErrorOrigin(fields);
  if (origin) {
    defineErrorProperty("url", origin.url);
    defineErrorProperty("host", origin.host);
  }
  const userAgent = boundedErrorField(fields.errorUserAgent);
  if (userAgent) defineErrorProperty("userAgent", userAgent);
  return error;
}

export function stringifyMobileAidokuSandboxValue(
  value: unknown,
  label: string,
): string {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    throw new Error(`${label} is not serializable.`);
  }
  if (json === undefined) throw new Error(`${label} is not serializable.`);
  if (json.length > MAX_SANDBOX_INPUT_JSON_CHARACTERS) {
    throw new Error(`${label} exceeds the isolated runtime safety limit.`);
  }
  return json;
}

export function parseMobileAidokuSandboxResponse<T>(json: string): T {
  if (
    typeof json !== "string" ||
    json.length === 0 ||
    json.length > MAX_SANDBOX_RESPONSE_JSON_CHARACTERS
  ) {
    throw new Error("The isolated Aidoku runtime returned an invalid response.");
  }

  let parsed: SandboxCompleteResponse | SandboxErrorResponse;
  try {
    parsed = JSON.parse(json) as SandboxCompleteResponse | SandboxErrorResponse;
  } catch {
    throw new Error("The isolated Aidoku runtime returned malformed JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The isolated Aidoku runtime returned an invalid response.");
  }
  if (parsed.status === "error") {
    throw reconstructMobileAidokuSandboxError(
      parsed,
      "The isolated Aidoku runtime failed.",
    );
  }
  if (parsed.status !== "complete" || !("value" in parsed)) {
    throw new Error("The isolated Aidoku runtime returned an invalid response.");
  }
  return parsed.value as T;
}
