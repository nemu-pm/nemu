import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { MobileSheetScaffold, useNemuTheme } from "@/design-system";
import { MobileCloudSyncCard } from "@/components/MobileCloudSyncCard";
import { MobileNativeStackSheet, mobileNativeStackSheetAvailable } from "@/components/MobileNativeStackSheet";
import { useMobileJapaneseLearningSignedIn } from "@/lib/mobileJapaneseLearningAuth";
import type { MobileStrings } from "@/lib/mobileI18n";
import { MOBILE_NATIVE_STACK_SHEET_BAR } from "@/lib/mobileNativeStackSheet";
import { READER_SETTINGS_FORM_INSET } from "@/lib/readerSettingsNativePopoverLayout";

/** The bar over the card's two text lines and provider buttons, until the page is measured. */
const SIGN_IN_SHEET_ESTIMATED_HEIGHT = MOBILE_NATIVE_STACK_SHEET_BAR + 146;

interface JapaneseLearningSignInSheetProps {
  visible: boolean;
  strings: MobileStrings;
  onClose: () => void;
}

/**
 * Web `AuthGateDialog` (`requireAuthOrPrompt` → `SignInDialog`) for Nemu
 * Chat and the signed-out notices: the app's own sign-in UI (the Settings
 * Cloud Sync card) in a sheet over the reader, presented instead of the chat
 * while signed out. It closes itself once a session exists; the chat is not
 * opened afterwards, as on web. iOS: the sheet's own bar, titled, with ✕ where
 * every other sheet has it, sized to the card.
 */
export function JapaneseLearningSignInSheet({
  visible,
  strings,
  onClose,
}: JapaneseLearningSignInSheetProps) {
  const { tokens } = useNemuTheme();
  const signedIn = useMobileJapaneseLearningSignedIn();
  // The card (and its session and sync queries) lives only while the sheet is
  // up or leaving, not for every surface that can host this sheet.
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (visible && signedIn) onClose();
  }, [onClose, signedIn, visible]);

  if (mobileNativeStackSheetAvailable) {
    return (
      <MobileNativeStackSheet
        visible={visible}
        onClose={onClose}
        onDismiss={() => setMounted(false)}
        pages={[
          {
            id: "sign-in",
            title: strings.welcome.signIn,
            render: () => <View style={styles.stackPage}>{mounted ? <MobileCloudSyncCard /> : null}</View>,
          },
        ]}
        fullWidthBesideBar
        closeAccessibilityLabel={strings.common.close}
        group="japanese-learning-sign-in"
        estimatedHeight={SIGN_IN_SHEET_ESTIMATED_HEIGHT}
      />
    );
  }

  return (
    <MobileSheetScaffold
      visible={visible}
      onRequestClose={onClose}
      backgroundColor={tokens.card}
      backdropOnPress={onClose}
      onDismiss={() => setMounted(false)}
      dismissLabel={strings.common.cancel}
      frameMaxHeight="auto"
    >
      {mounted ? <MobileCloudSyncCard /> : null}
    </MobileSheetScaffold>
  );
}

const styles = StyleSheet.create({
  stackPage: {
    paddingHorizontal: READER_SETTINGS_FORM_INSET,
    paddingTop: 8,
    // The sheet adds the home indicator's inset below this.
    paddingBottom: 4,
  },
});
