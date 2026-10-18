import { useEffect } from "react";
import { router } from "expo-router";
import { AccountScreen } from "@/screens/AccountScreen";
import { mobileSyncConfig } from "@/sync/mobileSyncConfig";

/**
 * Without sync there is no account (Settings hides its entry): a deep link
 * returns to Settings instead of a page with no Convex client behind it. The
 * Settings root is anchored beneath this route, so dismissing back to it
 * leaves no second copy with a Back button.
 */
function ReturnToSettings() {
  useEffect(() => {
    router.dismissTo("/settings");
  }, []);
  return null;
}

export default function SettingsAccountRoute() {
  if (!mobileSyncConfig.configured) return <ReturnToSettings />;
  return <AccountScreen />;
}
