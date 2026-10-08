import { useEffect } from "react";
import { Slot } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { MobileShell } from "@/components/MobileShell";
import { MobileNowReadingAccessory } from "@/components/explore/MobileNowReadingAccessory";
import { useMobileNowReading } from "@/components/explore/useMobileNowReading";
import {
  reportMobileNowReadingShown,
  useMobileNowReadingCovered,
} from "@/components/explore/mobileNowReadingVisibility";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { nemuFontWeight, useNemuTheme } from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";

export default function TabsLayout() {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  // Design-explore: the "now reading" accessory, and a tab bar that
  // minimises on scroll so the accessory can slide inline.
  const nowReading = useMobileNowReading();
  // `EXPO_PUBLIC_NEMU_NOW_READING=away`: not while the Library's own card shows it.
  const nowReadingCovered = useMobileNowReadingCovered();
  const nowReadingShown = Boolean(nowReading) && !nowReadingCovered;
  useEffect(() => {
    reportMobileNowReadingShown(nowReadingShown);
  }, [nowReadingShown]);

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
        minimizeBehavior={mobileDesignExploreFlag ? "onScrollDown" : "never"}
        shadowColor={tokens.border}
        tintColor={tokens.primary}
        disableTransparentOnScrollEdge
      >
        {nowReading && !nowReadingCovered ? (
          <NativeTabs.BottomAccessory>
            <MobileNowReadingAccessory nowReading={nowReading} />
          </NativeTabs.BottomAccessory>
        ) : null}
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
