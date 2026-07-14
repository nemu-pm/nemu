import type { SourcePackageSetting } from "./schema";

export function makeMobileSourceSettingsLoadSignature({
  sourceKey,
  sourceKeys,
  schema,
}: {
  sourceKey: string | null | undefined;
  sourceKeys: readonly string[];
  schema: readonly SourcePackageSetting[];
}): string {
  // Keep the full canonical payload instead of a short hash. A collision here
  // could let a consumer start a source with settings loaded for a different
  // schema, while the metadata size limits already keep this string bounded.
  return JSON.stringify([sourceKey ?? null, sourceKeys, schema]);
}

export function isMobileSourceSettingsLoadPending({
  loading,
  loadedSignature,
  currentSignature,
}: {
  loading: boolean;
  loadedSignature: string | null;
  currentSignature: string;
}): boolean {
  return loading || loadedSignature !== currentSignature;
}
