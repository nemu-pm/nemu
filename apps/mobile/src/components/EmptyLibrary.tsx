import { useState } from "react";
import type { ComponentProps } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  nemuText,
  spacing,
  useNemuTheme,
  usesNemuNativeHeader,
  NemuButton,
  NemuPressable,
} from "@/design-system";
import { getMobileFloatingTabBarOverlayExtent } from "@/lib/mobileFloatingTabBarClearance";
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
  /** Raw diagnostic string (e.g. describeMobileErrorDetail output). */
  diagnostic?: string;
  diagnosticDetailsLabel?: string;
};

export function EmptyLibrary({
  title,
  description,
  actionLabel,
  actionIcon,
  onActionPress,
  actionDisabled,
  actionLoading,
  diagnostic,
  diagnosticDetailsLabel,
}: EmptyLibraryProps) {
  const { tokens } = useNemuTheme();
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const layout = getMobileEmptyLibraryLayout({
    height,
    width,
    // Match web `w-[100vw]` on phones; page padding must not shrink the art.
    horizontalPadding: 0,
    verticalChrome:
      (usesNemuNativeHeader ? insets.top + 44 : insets.top) +
      spacing.pageTop +
      getMobileFloatingTabBarOverlayExtent(insets.bottom),
  });
  const disabled = Boolean(actionDisabled || actionLoading);

  return (
    <View style={[styles.root, { minHeight: layout.rootMinHeight }]}>
      <NemuPortraitHalo
        maxWidth={layout.portraitMaxWidth}
        style={[
          styles.portraitWrap,
          { marginBottom: NEMU_WEB_EMPTY_LIBRARY_VISUAL.portraitMarginBottom + layout.glowBleed },
        ]}
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
          {diagnostic ? (
            <View style={styles.diagnostic}>
              <NemuPressable
                accessibilityRole="button"
                accessibilityState={{ expanded: diagnosticOpen }}
                accessibilityLabel={diagnosticDetailsLabel ?? diagnostic.slice(0, 80)}
                hapticFeedback="selection"
                pressProfile="row"
                onPress={() => setDiagnosticOpen((open) => !open)}
                style={styles.diagnosticToggle}
              >
                <Ionicons
                  name={
                    diagnosticOpen
                      ? "chevron-down-outline"
                      : "chevron-forward-outline"
                  }
                  size={12}
                  color={tokens.mutedForeground}
                />
                <Text style={[nemuText.caption, { color: tokens.mutedForeground }]}>
                  {diagnosticDetailsLabel ?? "Details"}
                </Text>
              </NemuPressable>
              {diagnosticOpen ? (
                <Text
                  selectable
                  style={[
                    styles.diagnosticBody,
                    styles.diagnosticMono,
                    { color: tokens.mutedForeground },
                  ]}
                >
                  {diagnostic}
                </Text>
              ) : null}
            </View>
          ) : null}
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
  diagnostic: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 4,
  },
  diagnosticToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  diagnosticBody: {
    alignSelf: "stretch",
    maxWidth: 320,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(127,127,127,0.08)",
  },
  diagnosticMono: {
    fontFamily: "Menlo",
    fontSize: 11,
    lineHeight: 15,
  },
});
