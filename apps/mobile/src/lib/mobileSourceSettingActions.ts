import type { SourcePackageSetting } from "@/data/schema";
import { LOGIN_CODE_VERIFIER_SUFFIX } from "@nemu/core";

export const LOGIN_USERNAME_SUFFIX = ".username";
export const LOGIN_PASSWORD_SUFFIX = ".password";
export const LOGIN_COOKIE_KEYS_SUFFIX = ".keys";
export const LOGIN_COOKIE_VALUES_SUFFIX = ".values";
export const LOGIN_LOCAL_STORAGE_PREFIX = ".ls.";

const MAX_SESSION_ENTRIES = 128;
const MAX_SESSION_VALUE_BYTES = 64 * 1024;

export type MobileSourceLoginSubmission =
  | { method: "basic"; username: string; password: string }
  | {
      method: "web";
      cookies: Record<string, string>;
      localStorage: Record<string, string>;
    }
  | { method: "oauth"; token: string };

function assertBoundedValue(value: string, label: string): string {
  if (!value || new TextEncoder().encode(value).byteLength > MAX_SESSION_VALUE_BYTES) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function assertCookieName(value: string): string {
  const name = value.trim();
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
    throw new Error("Cookie name is invalid.");
  }
  return name;
}

function normalizeStringRecord(
  input: Record<string, unknown>,
  options: {
    allowedKeys?: ReadonlySet<string>;
    cookieNames?: boolean;
  } = {},
): Record<string, string> {
  const entries = Object.entries(input);
  if (entries.length > MAX_SESSION_ENTRIES) {
    throw new Error("Session data has too many entries.");
  }

  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = options.cookieNames ? assertCookieName(rawKey) : rawKey.trim();
    if (!key || options.allowedKeys?.has(key) === false) continue;
    const value = String(rawValue ?? "");
    if (!value) continue;
    if (/\r|\n/.test(value)) throw new Error("Session value is invalid.");
    output[key] = assertBoundedValue(value, "Session value");
  }
  return output;
}

function parseJsonRecord(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseCookies(value: string): Record<string, string> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{")) {
    return normalizeStringRecord(parseJsonRecord(trimmed, "Cookies"), {
      cookieNames: true,
    });
  }

  const entries: Record<string, string> = {};
  for (const part of trimmed.split(";")) {
    const separator = part.indexOf("=");
    const rawName = separator >= 0 ? part.slice(0, separator) : part;
    const rawValue = separator >= 0 ? part.slice(separator + 1) : "";
    entries[assertCookieName(rawName)] = rawValue.trim();
  }
  return normalizeStringRecord(entries, { cookieNames: true });
}

export function parseMobileSourceWebSession(
  cookiesText: string,
  localStorageText: string,
  allowedLocalStorageKeys: string[],
): {
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
} {
  const cookies = parseCookies(cookiesText);
  const localStorage = localStorageText.trim()
    ? normalizeStringRecord(
        parseJsonRecord(localStorageText, "Local storage"),
        { allowedKeys: new Set(allowedLocalStorageKeys) },
      )
    : {};
  if (Object.keys(cookies).length === 0 && Object.keys(localStorage).length === 0) {
    throw new Error("Session data is required.");
  }
  return { cookies, localStorage };
}

export function sourceLoginStoragePatch(
  setting: SourcePackageSetting,
  submission: MobileSourceLoginSubmission,
): Record<string, unknown> {
  if (submission.method === "oauth") {
    return {
      [setting.key]: assertBoundedValue(submission.token, "OAuth token"),
    };
  }
  if (submission.method === "basic") {
    const username = submission.username.trim();
    return {
      [setting.key]: "logged_in",
      [`${setting.key}${LOGIN_USERNAME_SUFFIX}`]: assertBoundedValue(
        username,
        "Username",
      ),
      [`${setting.key}${LOGIN_PASSWORD_SUFFIX}`]: assertBoundedValue(
        submission.password,
        "Password",
      ),
    };
  }

  const cookies = normalizeStringRecord(submission.cookies, {
    cookieNames: true,
  });
  const localStorage = normalizeStringRecord(submission.localStorage, {
    allowedKeys: new Set(setting.localStorageKeys ?? []),
  });
  if (Object.keys(cookies).length === 0 && Object.keys(localStorage).length === 0) {
    throw new Error("Session data is required.");
  }
  const cookieKeys = Object.keys(cookies).sort();
  return {
    [setting.key]: "logged_in",
    [`${setting.key}${LOGIN_COOKIE_KEYS_SUFFIX}`]: cookieKeys,
    [`${setting.key}${LOGIN_COOKIE_VALUES_SUFFIX}`]: cookieKeys.map(
      (key) => cookies[key]!,
    ),
    ...Object.fromEntries(
      Object.keys(localStorage)
        .sort()
        .map((key) => [
          `${setting.key}${LOGIN_LOCAL_STORAGE_PREFIX}${key}`,
          localStorage[key],
        ]),
    ),
  };
}

export function sourceLoginLogoutKeys(setting: SourcePackageSetting): string[] {
  return [
    setting.key,
    `${setting.key}${LOGIN_USERNAME_SUFFIX}`,
    `${setting.key}${LOGIN_PASSWORD_SUFFIX}`,
    `${setting.key}${LOGIN_COOKIE_KEYS_SUFFIX}`,
    `${setting.key}${LOGIN_COOKIE_VALUES_SUFFIX}`,
    `${setting.key}${LOGIN_CODE_VERIFIER_SUFFIX}`,
    ...(setting.localStorageKeys ?? []).map(
      (key) => `${setting.key}${LOGIN_LOCAL_STORAGE_PREFIX}${key}`,
    ),
  ];
}
