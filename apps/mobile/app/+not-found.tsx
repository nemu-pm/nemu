import { Stack, router } from "expo-router";
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
// so it shows the app's own: the native back button when there is a screen to
// go back to (an unmatched link followed from inside the app), and Go to
// Library either way.
export default function NotFoundScreen() {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const { tokens } = useNemuTheme();
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const usesNativeHeader = usesNemuNativeHeader;

  return (
    <>
      {usesNativeHeader ? (
        <Stack.Screen
          options={{
            ...createNemuNativeScreenOptions(tokens, strings.common.pageNotFound, verticalBarSide),
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
