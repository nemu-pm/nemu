import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  NemuButton,
  radius,
  useNemuTheme,
} from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { getMobileStrings } from "@/lib/mobileI18n";

type MobileSourceInstallSheetProps = {
  visible: boolean;
  title: string;
  sourceIcon?: string;
  /**
   * Aborts the package download and dismisses the sheet. Without it the sheet
   * would be a non-dismissible spinner over an unbounded download.
   */
  onCancel?: () => void;
};

export function MobileSourceInstallSheet({
  visible,
  title,
  sourceIcon,
  onCancel,
}: MobileSourceInstallSheetProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onCancel ?? (() => {})}
      title={title}
      dismissLabel={strings.common.cancel}
      // Pan-down stays off so a stray swipe cannot abandon an install, which
      // is exactly why the scaffold must render the dismiss control instead.
      enablePanDownToClose={false}
      contentBottomInset={24}
      contentStyle={styles.sheet}
      testID="SourceInstallSheet"
    >
      <View
        accessible
        accessibilityLabel={title}
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
        style={styles.progressCluster}
      >
        <View
          style={[
            styles.sourceIcon,
            {
              backgroundColor: tokens.sourceIconGlass,
              borderColor: tokens.border,
            },
          ]}
        >
          {sourceIcon ? (
            <MobileCachedImage
              fallback={
                <Ionicons
                  name="globe-outline"
                  size={24}
                  color={tokens.mutedForeground}
                />
              }
              uriOwnership="source"
              source={{ uri: sourceIcon }}
              style={styles.sourceIconImage}
            />
          ) : (
            <Ionicons name="globe-outline" size={24} color={tokens.mutedForeground} />
          )}
        </View>
        <ActivityIndicator color={tokens.primary} size="large" />
      </View>
      {onCancel ? (
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.cancelAction}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={onCancel}
          variant="secondary"
        />
      ) : null}
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    paddingTop: 2,
  },
  cancelAction: {
    alignSelf: "stretch",
  },
  progressCluster: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  sourceIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
  },
  sourceIconImage: {
    width: "100%",
    height: "100%",
  },
});
