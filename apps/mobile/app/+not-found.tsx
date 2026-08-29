import { Stack, router } from "expo-router";
import { MobilePageEmpty } from "@/components/MobilePageEmpty";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { PageScaffold, usesNemuNativeHeader } from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";

// Catches unmatched deep links (including the OAuth fallback callback
// `nemu://oauth/callback`, which resolves the browser auth session but has no
// screen of its own) so they land on a themed screen instead of the default
// Unmatched Route page.
export default function NotFoundScreen() {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const usesNativeHeader = usesNemuNativeHeader;

  return (
    <>
      {usesNativeHeader ? (
        <Stack.Screen options={{ title: strings.common.pageNotFound }} />
      ) : null}
      <PageScaffold nativeHeader={usesNativeHeader}>
        <MobilePageEmpty
          icon="compass-outline"
          title={strings.common.pageNotFound}
          description={strings.common.pageNotFoundDescription}
          actionLabel={strings.common.goHome}
          actionIcon="home-outline"
          onActionPress={() => {
            router.replace("/");
          }}
        />
      </PageScaffold>
    </>
  );
}
