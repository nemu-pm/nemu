import { useEffect, useRef, useState } from "react";
import { Linking, Text } from "react-native";
import { NemuPressable, useMobileNativeSheetTheme } from "@/design-system";
import { MobileConfirmationSheet } from "./MobileConfirmationSheet";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { getMobileStrings } from "@/lib/mobileI18n";
import { MOBILE_PRIVACY_POLICY_URL, registerMobileAiConsentPresenter } from "@/lib/mobileAiConsent";

/** Android / web host for the one-time third-party AI notice. */
export function MobileAiConsentHost() {
  const strings = getMobileStrings(useMobileLanguageSettings().appLanguage);
  const copy = strings.aiConsent;
  const { tokens } = useMobileNativeSheetTheme();
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(
    () =>
      registerMobileAiConsentPresenter(
        () =>
          new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
            setVisible(true);
          }),
      ),
    [],
  );

  const settle = (accepted: boolean) => {
    resolveRef.current?.(accepted);
    resolveRef.current = null;
    setVisible(false);
  };

  return (
    <MobileConfirmationSheet
      visible={visible}
      title={copy.title}
      description={copy.bodyBefore + copy.privacyPolicy + copy.bodyAfter}
      iconName="sparkles-outline"
      cancelLabel={copy.decline}
      confirmLabel={copy.accept}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    >
      <NemuPressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(MOBILE_PRIVACY_POLICY_URL).catch(() => undefined)}
      >
        <Text style={{ color: tokens.primary, textDecorationLine: "underline" }}>
          {copy.privacyPolicy}
        </Text>
      </NemuPressable>
    </MobileConfirmationSheet>
  );
}
