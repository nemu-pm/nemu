/**
 * Source Browse Page - Router component
 * 
 * Detects source type from loader data and delegates to the appropriate
 * provider-specific browse implementation:
 * - Aidoku: Full home layouts, listings, search with filters
 * - Tachiyomi: Listings (Popular/Latest), search with filters (no home)
 */
import { useLoaderData } from "@tanstack/react-router";
import type { SourceBrowseLoaderData } from "@/router";
import { AidokuBrowse, type AidokuBrowseData } from "./source-browse/aidoku-browse";
import { TachiyomiBrowse, type TachiyomiBrowseData } from "./source-browse/tachiyomi-browse";

export function SourceBrowsePage() {
  const loaderData = useLoaderData({ from: "/_shell/browse/$registryId/$sourceId" }) as SourceBrowseLoaderData;

  // Route to provider-specific implementation based on source type
  switch (loaderData.type) {
    case "aidoku":
      return <AidokuBrowse data={loaderData as AidokuBrowseData} />;
    case "tachiyomi":
      return <TachiyomiBrowse data={loaderData as TachiyomiBrowseData} />;
    default: {
      // TypeScript exhaustiveness check
      const _exhaustiveCheck: never = loaderData;
      throw new Error(`Unknown source type: ${_exhaustiveCheck}`);
    }
  }
}
