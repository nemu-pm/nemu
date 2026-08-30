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
  const sourceRequestKey = useMemo(
    () =>
      source && url
        ? [
            source.id,
            source.packageCacheKey ?? "",
            source.packageUri ?? "",
            source.updatedAt ?? "",
            source.version,
            sourceSettingsRevision,
            url,
          ].join("|")
        : "",
    [source, sourceSettingsRevision, url],
  );
  const [state, setState] = useState<{
    key: string;
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
        if (active) setState({ key: sourceRequestKey, request });
      });

    return () => {
      active = false;
    };
  }, [getSourceSettings, source, sourceRequestKey, url]);

  return state?.key === sourceRequestKey ? state.request : null;
}
