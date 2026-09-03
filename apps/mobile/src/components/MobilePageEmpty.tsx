import { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  nemuText,
  useNemuTheme,
  NEMU_PROMINENT_CTA_SIZE,
  NemuButton,
  NemuPressable,
} from "@/design-system";
import { getMobileStrings } from "@/lib/mobileI18n";
import { shouldUseCompactMobilePageEmptyLayout } from "@/lib/mobilePageEmptyLayout";

type MobilePageEmptyProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  variant?: "full" | "inline";
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onActionPress?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  /** Raw diagnostic string (e.g. describeMobileErrorDetail output). */
  diagnostic?: string;
  /** Optional override; the localized "Technical details" label is default. */
  diagnosticDetailsLabel?: string;
};

export function MobilePageEmpty({
  icon,
  title,
  description,
  variant = "full",
  actionLabel,
  actionIcon = "add-outline",
  onActionPress,
  actionDisabled,
  actionLoading,
  diagnostic,
  diagnosticDetailsLabel,
}: MobilePageEmptyProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const detailsLabel =
    diagnosticDetailsLabel ?? strings.feedback.technicalDetails;
  const { height } = useWindowDimensions();
  const compactHeight = shouldUseCompactMobilePageEmptyLayout(height);
  const disabled = Boolean(actionDisabled || actionLoading);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  return (
    <View
      style={[
        styles.root,
        variant === "inline" ? styles.inlineRoot : null,
        compactHeight ? styles.compactRoot : null,
      ]}
    >
      <View style={[styles.header, compactHeight ? styles.compactHeader : null]}>
        <View
          style={[
            styles.media,
            compactHeight ? styles.compactMedia : null,
            { backgroundColor: tokens.muted },
          ]}
        >
          <Ionicons
            name={icon}
            size={compactHeight ? 24 : 48}
            color={tokens.mutedForeground}
          />
        </View>
        <Text style={[nemuText.pageEmptyTitle, styles.title, { color: tokens.foreground }]}>
          {title}
        </Text>
        {description ? (
          <Text
            style={[
              nemuText.pageEmptyDescription,
              styles.description,
              { color: tokens.mutedForeground },
            ]}
          >
            {description}
          </Text>
        ) : null}
        {diagnostic && !compactHeight ? (
          <View style={styles.diagnostic}>
            <NemuPressable
              accessibilityRole="button"
              accessibilityState={{ expanded: diagnosticOpen }}
              accessibilityLabel={detailsLabel}
              hapticFeedback="selection"
              pressProfile="row"
              onPress={() => setDiagnosticOpen((open) => !open)}
              style={styles.diagnosticToggle}
            >
              <Ionicons
                name={diagnosticOpen ? "chevron-down-outline" : "chevron-forward-outline"}
                size={12}
                color={tokens.mutedForeground}
              />
              <Text
                style={[nemuText.caption, { color: tokens.mutedForeground }]}
              >
                {detailsLabel}
              </Text>
            </NemuPressable>
            {diagnosticOpen ? (
              <Text
                selectable
                style={[
                  styles.diagnosticBody,
                  styles.diagnosticMono,
                  {
                    backgroundColor: tokens.secondary,
                    color: tokens.mutedForeground,
                  },
                ]}
              >
                {diagnostic}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <NemuButton
          accessibilityLabel={actionLabel}
          disabled={disabled}
          icon={actionIcon}
          label={actionLabel}
          loading={actionLoading}
          // Same geometry as the library empty state and onboarding CTA so the
          // primary empty-state action never changes size between pages.
          size={NEMU_PROMINENT_CTA_SIZE}
          onPress={onActionPress}
          variant="default"
        />
      ) : null}
    </View>
  );
}

const MONOSPACE_FONT_FAMILY = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

const styles = StyleSheet.create({
  root: {
    minHeight: 500,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 48,
  },
  inlineRoot: {
    minHeight: 340,
  },
  compactRoot: {
    minHeight: 0,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  header: {
    maxWidth: 320,
    alignItems: "center",
    gap: 8,
  },
  compactHeader: {
    gap: 3,
  },
  media: {
    width: 96,
    height: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    marginBottom: 8,
  },
  compactMedia: {
    width: 48,
    height: 48,
    marginBottom: 0,
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
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
    padding: 10,
    borderRadius: 8,
  },
  diagnosticMono: {
    fontFamily: MONOSPACE_FONT_FAMILY,
    fontSize: 11,
    lineHeight: 15,
  },
});
