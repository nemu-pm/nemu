import { Stack, router, useNavigation } from "expo-router";
import { MobilePageEmpty } from "@/components/MobilePageEmpty";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  createNemuNativeScreenOptions,
  PageScaffold,
  useNemuTheme,
  usesNemuNativeHeader,
} from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";

// Catches unmatched deep links (including the OAuth fallback callback
// `nemu://oauth/callback`, which resolves the browser auth session but has no
// screen of its own) so they land on a themed screen instead of the default
// Unmatched Route page. It sits on the root stack, whose screens have no bar,
// so it shows the app's own: the native back button when the navigation has a
// screen to go back to, and Go to Library either way. A link from outside the
// app replaces the navigation state with this page alone (UIKit would still
// offer a back that pops nothing), so its back follows `canGoBack`.
export default function NotFoundScreen() {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const { tokens } = useNemuTheme();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const canGoBack = useNavigation().canGoBack();
  const usesNativeHeader = usesNemuNativeHeader;

  return (
    <>
      {usesNativeHeader ? (
        <Stack.Screen
          options={{
            ...createNemuNativeScreenOptions(tokens, strings.common.pageNotFound, verticalBarSide),
            headerBackVisible: canGoBack,
          }}
        />
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
