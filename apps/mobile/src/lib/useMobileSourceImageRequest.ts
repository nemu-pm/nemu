import { useCallback, useEffect, useMemo, useState } from "react";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { useMobileDataRevision } from "@/data/mobileDataEvents";
import type { InstalledSource } from "@/data/schema";
import { getMobileInstalledSourceSettingsKeys } from "@/lib/mobileInstalledSourceKeys";
import {
  loadMobileSourceSettingsByKeys,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import {
  resolveCachedMobileSourceImageRequest,
  type MobileSourceImageRequest,
} from "@/sources/mobileSourceImages";
import { makeMobileRuntimeSourceKey, normalizeInstalledSource } from "@/sources/mobileSourceRuntime";

export function useMobileSourceImageRequest(
  source: InstalledSource | null | undefined,
  url: string | null | undefined,
): MobileSourceImageRequest | null {
  const store = useMobileDataStore();
  const sourceSettingsRevision = useMobileDataRevision(["sourceSettings"]);
  // Identity: which image this is. A resolved request stays valid for the
  // same identity while a refresh is in flight.
  const imageIdentityKey = useMemo(
    () => (source && url ? [source.id, url].join("|") : ""),
    [source, url],
  );
  // Refresh: anything that can change the resolved headers. Bumping it
  // re-resolves in the background instead of dropping the current request —
  // a source-settings save must not blank every mounted cover, and covers
  // for referer/auth sources must never fall back to a headerless URL.
  const sourceRequestKey = useMemo(
    () =>
      source && url
        ? [
            imageIdentityKey,
            source.packageCacheKey ?? "",
            source.packageUri ?? "",
            source.updatedAt ?? "",
            source.version,
            sourceSettingsRevision,
          ].join("|")
        : "",
    [imageIdentityKey, source, sourceSettingsRevision, url],
  );
  const [state, setState] = useState<{
    identityKey: string;
    request: MobileSourceImageRequest | null;
  } | null>(null);
  const getSourceSettings = useCallback(
    async (_sourceKey: string, sourceRecord: InstalledSource) => {
      const normalized = normalizeInstalledSource(sourceRecord);
      const runtimeSourceKey = makeMobileRuntimeSourceKey(normalized);
      const saved = await loadMobileSourceSettingsByKeys(store, [
        runtimeSourceKey,
        ...getMobileInstalledSourceSettingsKeys(sourceRecord),
      ]);
      return mergeSourceSettingValues(
        sourceRecord.packageMetadata?.settings ?? [],
        saved?.values,
      );
    },
    [store],
  );

  useEffect(() => {
    if (!source || !url || !sourceRequestKey) return;

    let active = true;
    void resolveCachedMobileSourceImageRequest(source, url, {
      getSourceSettings,
    })
      .catch(() => null)
      .then((request) => {
        if (!active) return;
        setState((current) =>
          // A failed refresh keeps the last good request for the same image.
          request === null &&
          current?.identityKey === imageIdentityKey &&
          current.request
            ? current
            : { identityKey: imageIdentityKey, request },
        );
      });

    return () => {
      active = false;
    };
  }, [getSourceSettings, imageIdentityKey, source, sourceRequestKey, url]);

  return state?.identityKey === imageIdentityKey ? state.request : null;
}
