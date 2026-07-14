import { Slot } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { MobileShell } from "@/components/MobileShell";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { nemuFontWeight, useNemuTheme } from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";

export default function TabsLayout() {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);

  if (Platform.OS === "ios") {
    return (
      <NativeTabs
        backgroundColor={tokens.background}
        blurEffect="systemMaterial"
        iconColor={{
          default: tokens.mutedForeground,
          selected: tokens.primary,
        }}
        labelStyle={{
          default: { color: tokens.mutedForeground },
          selected: { color: tokens.primary, fontWeight: nemuFontWeight.semibold },
        }}
        minimizeBehavior="never"
        shadowColor={tokens.border}
        tintColor={tokens.primary}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger name="library" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>{strings.nav.library}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "house", selected: "house.fill" }}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="browse" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>{strings.nav.browse}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "globe", selected: "globe" }}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="search" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>{strings.nav.search}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "magnifyingglass", selected: "magnifyingglass" }}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" disableAutomaticContentInsets>
          <NativeTabs.Trigger.Label>{strings.nav.settings}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "gearshape", selected: "gearshape.fill" }}
          />
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <MobileShell>
      <Slot />
    </MobileShell>
  );
}
