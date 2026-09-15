/**
 * Source Browse Page - Router component
 * 
 * Detects source type from loader data and delegates to the appropriate
 * provider-specific browse implementation:
 * - Aidoku: Full home layouts, listings, search with filters
 * - Tachiyomi: Listings (Popular/Latest), search with filters (no home)
 */
import { Link, useLoaderData } from "@tanstack/react-router";
import type { SourceBrowseLoaderData } from "@/router";
import { AidokuBrowse, type AidokuBrowseData } from "./source-browse/aidoku-browse";
import { TachiyomiBrowse, type TachiyomiBrowseData } from "./source-browse/tachiyomi-browse";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/components/page-title";
import { PageEmpty } from "@/components/page-empty";
import { Button } from "@/components/ui/button";
import { Alert02Icon } from "@hugeicons/core-free-icons";

export function SourceBrowsePage() {
  const { t } = useTranslation();
  const loaderData = useLoaderData({ from: "/_shell/browse/$registryId/$sourceId" }) as SourceBrowseLoaderData;

  usePageTitle([
    loaderData.type === "unavailable"
      ? t("browse.sourceUnavailable")
      : loaderData.source.name,
    t("nav.browse"),
  ]);

  // Route to provider-specific implementation based on source type
  switch (loaderData.type) {
    case "unavailable":
      // Disabled, uninstalled, or failed to load: the loader never throws for
      // this, so the route renders a readable state with a way to fix it.
      return (
        <PageEmpty
          icon={Alert02Icon}
          title={t("browse.sourceUnavailable")}
          description={
            loaderData.reason ?? t("browse.sourceUnavailableDescription")
          }
          action={
            <Button render={<Link to="/settings" />} variant="outline">
              {t("common.settings")}
            </Button>
          }
        />
      );
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
