import type { ComponentProps } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { nemuText, useNemuTheme, NemuButton } from "@/design-system";
import {
  getMobileEmptyLibraryLayout,
  NEMU_WEB_EMPTY_LIBRARY_VISUAL,
} from "@/lib/mobileEmptyLibraryLayout";
import { NemuPortraitHalo } from "./NemuPortraitHalo";

type EmptyLibraryActionIcon = ComponentProps<typeof NemuButton>["icon"];

type EmptyLibraryProps = {
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: EmptyLibraryActionIcon;
  onActionPress: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
};

export function EmptyLibrary({
  title,
  description,
  actionLabel,
  actionIcon,
  onActionPress,
  actionDisabled,
  actionLoading,
}: EmptyLibraryProps) {
  const { tokens } = useNemuTheme();
  const { height, width } = useWindowDimensions();
  const layout = getMobileEmptyLibraryLayout({ height, width });
  const disabled = Boolean(actionDisabled || actionLoading);

  return (
    <View style={[styles.root, { minHeight: layout.rootMinHeight }]}>
      <NemuPortraitHalo
        maxWidth={layout.portraitMaxWidth}
        style={styles.portraitWrap}
      />
      <View style={styles.details}>
        <View style={styles.copy}>
          <Text
            style={[nemuText.pageEmptyTitle, styles.title, { color: tokens.foreground }]}
          >
            {title}
          </Text>
          <Text
            style={[
              nemuText.pageEmptyDescription,
              styles.description,
              { color: tokens.mutedForeground },
            ]}
          >
            {description}
          </Text>
        </View>
        <NemuButton
          accessibilityLabel={actionLabel}
          disabled={disabled}
          icon={actionIcon}
          label={actionLabel}
          loading={actionLoading}
          size="lg"
          containerStyle={styles.action}
          onPress={onActionPress}
          variant="default"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: NEMU_WEB_EMPTY_LIBRARY_VISUAL.rootPadding,
  },
  portraitWrap: {
    marginBottom: NEMU_WEB_EMPTY_LIBRARY_VISUAL.portraitMarginBottom,
  },
  details: {
    flexShrink: 1,
    alignItems: "center",
  },
  copy: {
    maxWidth: 320,
    alignItems: "center",
    gap: NEMU_WEB_EMPTY_LIBRARY_VISUAL.copyGap,
  },
  title: {
    letterSpacing: NEMU_WEB_EMPTY_LIBRARY_VISUAL.titleLetterSpacing,
    lineHeight: NEMU_WEB_EMPTY_LIBRARY_VISUAL.titleLineHeight,
    textAlign: "center",
  },
  description: {
    lineHeight: NEMU_WEB_EMPTY_LIBRARY_VISUAL.descriptionLineHeight,
    textAlign: "center",
  },
  action: {
    marginTop: NEMU_WEB_EMPTY_LIBRARY_VISUAL.actionMarginTop,
  },
});
