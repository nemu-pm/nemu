import { PlatformColor, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button as SwiftButton,
  Label as SwiftLabel,
  Section as SwiftSection,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import { disabled as swiftDisabled, foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { hapticPress, hapticSelection } from "@/lib/haptics";
import { useMobileDesignExplore } from "@/lib/mobileDesignExplore";
import { getMobileCloudSignOutNativeSheetHeight } from "@/lib/mobileLibraryOptionsSheetLayout";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import { NativeCheckRow } from "./MobileNativeFormSheetParts.ios";
import type { MobileCloudSignOutNativeSheetProps } from "./MobileCloudSignOutNativeSheet.types";

export const mobileCloudSignOutNativeSheetAvailable = true;

const LABEL = PlatformColor("label");
const SECONDARY_LABEL = PlatformColor("secondaryLabel");
const DESTRUCTIVE = PlatformColor("systemRed");

/**
 * Sign Out as a native form sheet: Cancel and Sign Out in the bar, the two
 * data choices as checkmark rows under the question. "Remove data" is a
 * destructive row in the system red, and with it chosen so is Sign Out.
 */
export function MobileCloudSignOutNativeSheet({
  visible,
  strings,
  keepData,
  loading,
  error,
  onSelectChoice,
  onErrorDismiss,
  onClose,
  onConfirm,
}: MobileCloudSignOutNativeSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tightTop = useMobileDesignExplore();
  const sheetHeight = getMobileCloudSignOutNativeSheetHeight({
    question: strings.settings.cloudSyncSignOutMessage,
    choiceDetails: [
      strings.settings.cloudSyncKeepDataDescription,
      strings.settings.cloudSyncRemoveDataDescription,
    ],
    errorDetail: error?.detail ?? null,
    // A compact sheet floats 8pt in from each side; wide windows cap it.
    sheetWidth: Math.min(width - insets.left - insets.right - 16, 620),
    fontScale,
    maxHeight: height - insets.top,
    bottomInset: insets.bottom,
  });
  const choice = (nextKeepData: boolean) => {
    if (loading || nextKeepData === keepData) return;
    void hapticSelection();
    onSelectChoice(nextKeepData);
  };

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={() => {
        if (!loading) onClose();
      }}
      title={strings.settings.cloudSyncSignOutTitle}
      detents={[{ height: sheetHeight }]}
      tightTop={tightTop}
      padSizing="form"
      interactiveDismissDisabled={loading}
      cancel={{ label: strings.common.cancel, onPress: onClose, disabled: loading }}
      confirm={{
        label: strings.settings.cloudSyncSignOut,
        accessibilityLabel: strings.settings.cloudSyncSignOutLabel,
        busy: loading,
        // Removing this device's data: the confirm reads destructive too.
        destructive: !keepData,
        onPress: () => {
          void hapticPress();
          onConfirm();
        },
      }}
      testID="MobileCloudSignOutSheet"
    >
      <SwiftSection header={<SwiftText>{strings.settings.cloudSyncSignOutMessage}</SwiftText>}>
        <NativeCheckRow
          title={strings.settings.cloudSyncKeepData}
          detail={strings.settings.cloudSyncKeepDataDescription}
          detailLines={2}
          systemImage="iphone"
          selected={keepData}
          disabled={loading}
          tintColor={tokens.primary}
          textColor={LABEL}
          detailColor={SECONDARY_LABEL}
          onPress={() => choice(true)}
        />
        <NativeCheckRow
          title={strings.settings.cloudSyncRemoveData}
          detail={strings.settings.cloudSyncRemoveDataDescription}
          detailLines={2}
          systemImage="trash"
          selected={!keepData}
          disabled={loading}
          // A destructive row: title, symbol and checkmark in the system red.
          tintColor={DESTRUCTIVE}
          textColor={DESTRUCTIVE}
          detailColor={SECONDARY_LABEL}
          onPress={() => choice(false)}
        />
      </SwiftSection>
      {error ? (
        <SwiftSection footer={<SwiftText>{error.detail}</SwiftText>}>
          <SwiftLabel
            title={error.title}
            systemImage="exclamationmark.triangle"
            color={tokens.danger}
            modifiers={[foregroundStyle(tokens.danger)]}
          />
          <SwiftButton
            label={strings.common.clear}
            onPress={onErrorDismiss}
            modifiers={loading ? [swiftDisabled(true)] : []}
          />
        </SwiftSection>
      ) : null}
    </MobileNativeFormSheet>
  );
}
