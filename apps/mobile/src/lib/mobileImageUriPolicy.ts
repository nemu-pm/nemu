export type MobileImageUriOwnership = "source" | "app";

export type MobileImageUriPolicy =
  | {
      allowed: true;
      kind: "source-remote" | "app-local";
      error: null;
    }
  | {
      allowed: false;
      kind: "blocked";
      error: string;
    };

const APP_LOCAL_IMAGE_SCHEMES = new Set([
  "asset",
  "assets-library",
  "blob",
  "content",
  "file",
  "ph",
]);

function uriScheme(uri: string): string | null {
  return /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase() ?? null;
}

function hasAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isValidSourceRemoteImageUri(uri: string): boolean {
  const scheme = uriScheme(uri);
  if (scheme !== "http" && scheme !== "https") return false;
  if (uri !== uri.trim() || hasAsciiControlCharacter(uri)) return false;
  try {
    const url = new URL(uri);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function isValidAppLocalImageUri(uri: string): boolean {
  if (uri !== uri.trim() || hasAsciiControlCharacter(uri)) return false;
  const scheme = uriScheme(uri);
  if (!scheme) return false;
  if (scheme === "data") {
    return /^data:image\/(?:avif|gif|heic|heif|jpeg|png|webp);base64,/i.test(
      uri,
    );
  }
  return APP_LOCAL_IMAGE_SCHEMES.has(scheme);
}

/**
 * Third-party source values and app-created local values have deliberately
 * different allowlists. Callers must choose the ownership boundary instead of
 * letting an untrusted `file:`, `content:`, or `data:` URI reach React Native's
 * image loader.
 */
export function getMobileImageUriPolicy(
  uri: string,
  ownership: MobileImageUriOwnership,
): MobileImageUriPolicy {
  if (ownership === "source") {
    return isValidSourceRemoteImageUri(uri)
      ? { allowed: true, kind: "source-remote", error: null }
      : {
          allowed: false,
          kind: "blocked",
          error: "Source images must use a valid HTTP or HTTPS URL.",
        };
  }

  return isValidAppLocalImageUri(uri)
    ? { allowed: true, kind: "app-local", error: null }
    : {
        allowed: false,
        kind: "blocked",
        error: "App-owned images must use an approved local image URI.",
      };
}
