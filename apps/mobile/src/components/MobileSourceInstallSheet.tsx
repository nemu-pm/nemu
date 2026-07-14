import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  MobileCachedImage,
  MobileNativeSheetScaffold,
  radius,
  useNemuTheme,
} from "@/design-system";

type MobileSourceInstallSheetProps = {
  visible: boolean;
  title: string;
  sourceIcon?: string;
};

export function MobileSourceInstallSheet({
  visible,
  title,
  sourceIcon,
}: MobileSourceInstallSheetProps) {
  const { tokens } = useNemuTheme();

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={() => {}}
      title={title}
      showDismissButton={false}
      enablePanDownToClose={false}
      snapPoints={[240]}
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
