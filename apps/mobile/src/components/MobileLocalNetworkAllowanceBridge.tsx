import { useEffect } from "react";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { useMobileDataRevision } from "@/data/mobileDataEvents";
import {
  applyMobileLocalNetworkAllowances,
  resolveMobileLocalNetworkAllowanceTargets,
} from "@/lib/mobileLocalNetworkAllowance";
import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";

/**
 * Keeps native's local-network grants equal to the server URLs the user saved
 * for self-hosted sources (see `mobileLocalNetworkAllowance`). Mounted once at
 * the app root; it renders nothing.
 */
export function MobileLocalNetworkAllowanceBridge() {
  const store = useMobileDataStore();
  const revision = useMobileDataRevision(["sourceSettings", "sources"]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const installed = (await store.getSyncSettings()).installedSources;
        const targets = await resolveMobileLocalNetworkAllowanceTargets(
          store,
          installed,
        );
        if (!cancelled) {
          applyMobileLocalNetworkAllowances(NemuAidokuModule, targets);
        }
      } catch (error) {
        console.warn("[LocalNetworkAllowance] Could not apply grants:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, revision]);

  return null;
}
