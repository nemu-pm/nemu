import type { InstalledSource } from "@/data/schema";
import type { SearchSourceDisplay } from "./mobileSearch";
import { toSearchSourceDisplay } from "./mobileSearch";

export type MobileSourceRouteRef = {
  registryId: string;
  sourceId: string;
};

export function getMobileSourceDisplayRouteRef(
  source: SearchSourceDisplay | null | undefined,
  fallback: MobileSourceRouteRef,
): MobileSourceRouteRef {
  return source
    ? { registryId: source.registryId, sourceId: source.rawSourceId }
    : fallback;
}

export function getMobileInstalledSourceRouteRef(
  source: InstalledSource | null | undefined,
  fallback: MobileSourceRouteRef,
): MobileSourceRouteRef {
  return getMobileSourceDisplayRouteRef(
    source ? toSearchSourceDisplay(source) : null,
    fallback,
  );
}
