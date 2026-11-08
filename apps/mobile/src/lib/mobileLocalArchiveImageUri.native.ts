import { Paths } from "expo-file-system";
import { resolveLocalArchiveUri } from "@/lib/localArchives/uris";
import { registerMobileAppLocalImageUri } from "./mobileAppLocalImageUris";

/**
 * A persisted `nemu-local://<volume>/<page>` reference (a library cover)
 * becomes a `file://` URI under the *current* documents directory, and is
 * registered as an app-local image so the image policy accepts it. The pattern
 * is strict (volume id and page file name only), so no other path can be named.
 */
export function resolveMobileLocalArchiveImageUri(uri: string): string {
  if (!uri.startsWith("nemu-local://")) return uri;
  const resolved = resolveLocalArchiveUri(uri, Paths.document.uri);
  if (!resolved) return uri;
  registerMobileAppLocalImageUri(resolved);
  return resolved;
}
