/**
 * Source Browse Page - Router component
 * 
 * Detects source type from loader data and delegates to the appropriate
 * provider-specific browse implementation:
 * - Aidoku: Full home layouts, listings, search with filters
 * - Tachiyomi: Listings (Popular/Latest), search with filters (no home)
 */
import { useCallback, useEffect } from "react";
import { Link, useLoaderData, useParams, useRouter } from "@tanstack/react-router";
import type { SourceBrowseLoaderData } from "@/router";
import { AidokuBrowse, type AidokuBrowseData } from "./source-browse/aidoku-browse";
import { TachiyomiBrowse, type TachiyomiBrowseData } from "./source-browse/tachiyomi-browse";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/components/page-title";
import { PageEmpty } from "@/components/page-empty";
import { Button } from "@/components/ui/button";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { useCloudflareBypassStore } from "@/components/cloudflare-bypass-dialog";
import { isSourceBrowseMatchFor, SOURCE_BROWSE_ROUTE_ID } from "./source-browse/reload";

export function SourceBrowsePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const loaderData = useLoaderData({ from: SOURCE_BROWSE_ROUTE_ID }) as SourceBrowseLoaderData;
  const cloudflare =
    loaderData.type === "unavailable" ? loaderData.cloudflare : null;
  const { registryId, sourceId } = useParams({ from: SOURCE_BROWSE_ROUTE_ID });

  // Re-run this source's loader, and only it: the shell, the browse layout
  // and any other cached source match keep their data.
  const reloadSource = useCallback(
    () =>
      router.invalidate({
        filter: (match) => isSourceBrowseMatchFor(match, { registryId, sourceId }),
      }),
    [router, registryId, sourceId],
  );

  // A Cloudflare challenge stopped the source from starting. Open the same
  // bypass dialog every other source surface uses (it offers the Nemu Agent).
  useEffect(() => {
    if (!cloudflare) return;
    useCloudflareBypassStore.getState().show(cloudflare.url ?? undefined);
  }, [cloudflare]);

  // Once the bypass succeeds, load the source again without waiting for the
  // user to press Retry. The dialog auto-closes (resetting its status) on its
  // own; this reacts to the `success` transition exactly once per success.
  // Keyed on a boolean, not the `cloudflare` object: a reload that is still
  // blocked hands back a new object (and `show` resets the status), which
  // must not re-trigger this.
  const bypassStatus = useCloudflareBypassStore((state) => state.status);
  const blocked = cloudflare !== null;
  useEffect(() => {
    if (bypassStatus !== "success" || !blocked) return;
    void reloadSource();
  }, [bypassStatus, blocked, reloadSource]);

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
      if (loaderData.cloudflare) {
        return (
          <PageEmpty
            icon={Alert02Icon}
            title={t("error.cloudflareBlocked")}
            description={t("error.cloudflareBlockedDescription")}
            action={
              <Button variant="outline" onClick={() => void reloadSource()}>
                {t("common.retry")}
              </Button>
            }
          />
        );
      }
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
