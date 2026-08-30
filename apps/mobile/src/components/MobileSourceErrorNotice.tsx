import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";

type MobileSourceErrorNoticeProps = {
  title?: string;
  detail: string;
  error?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function MobileSourceErrorNotice({
  title,
  detail,
  error = false,
  actionLabel,
  onActionPress,
}: MobileSourceErrorNoticeProps) {
  const { tokens } = useNemuTheme();

  return (
    <View style={[styles.notice, { backgroundColor: tokens.muted }]}>
      <Ionicons
        name="alert-circle-outline"
        size={16}
        color={error ? tokens.danger : tokens.mutedForeground}
      />
      <View style={styles.noticeCopy}>
        {title ? (
          <Text
            numberOfLines={1}
            style={[styles.noticeTitle, { color: tokens.foreground }]}
          >
            {title}
          </Text>
        ) : null}
        {/*
          `detail` follows the mobile error-copy contract in
          `mobileSourceErrors.ts`: localized copy on the first line, the raw
          exception text on an optional second line. Allow room for both.
        */}
        <Text
          numberOfLines={4}
          style={[styles.noticeText, { color: tokens.mutedForeground }]}
        >
          {detail}
        </Text>
      </View>
      {actionLabel && onActionPress ? (
        <NemuPressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onActionPress}
          pressedScale={0.94}
          style={[
            styles.noticeAction,
            { backgroundColor: tokens.card, borderColor: tokens.border },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.noticeActionText, { color: tokens.foreground }]}
          >
            {actionLabel}
          </Text>
        </NemuPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  noticeTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 17,
  },
  noticeAction: {
    minHeight: 32,
    maxWidth: 132,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  noticeActionText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
});
