import { useWindowDimensions } from "react-native";
import { useEffect, useRef, useState } from "react";
import { Section as SwiftSection, Text as SwiftText } from "@expo/ui/swift-ui";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet.ios";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { getMobileStrings } from "@/lib/mobileI18n";
import { MOBILE_PRIVACY_POLICY_URL, registerMobileAiConsentPresenter } from "@/lib/mobileAiConsent";

/** Root host for the one-time third-party AI notice (native iOS sheet). */
export function MobileAiConsentHost() {
  const strings = getMobileStrings(useMobileLanguageSettings().appLanguage).aiConsent;
  const { fontScale, width } = useWindowDimensions();
  // Content-sized: bar + one grouped row around the paragraph + a bottom margin.
  const body = strings.bodyBefore + strings.privacyPolicy + strings.bodyAfter;
  const ems = Array.from(body).reduce((sum, ch) => sum + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55), 0);
  const lines = Math.ceil(ems / Math.max(8, (width - 72) / (17 * fontScale)));
  const sheetHeight = Math.round(150 + lines * 24 * fontScale);
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
    <MobileNativeFormSheet
      visible={visible}
      title={strings.title}
      detents={[{ height: sheetHeight }]}
      cancel={{ label: strings.decline, onPress: () => settle(false) }}
      confirm={{ label: strings.accept, onPress: () => settle(true) }}
      onClose={() => settle(false)}
    >
      <SwiftSection>
        <SwiftText markdownEnabled>
          {`${strings.bodyBefore}[${strings.privacyPolicy}](${MOBILE_PRIVACY_POLICY_URL})${strings.bodyAfter}`}
        </SwiftText>
      </SwiftSection>
    </MobileNativeFormSheet>
  );
}
