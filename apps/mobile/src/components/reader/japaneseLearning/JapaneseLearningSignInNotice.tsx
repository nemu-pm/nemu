import { StyleSheet, View } from "react-native";
import {
  nemuText,
  NEMU_PROMINENT_CTA_SIZE,
  NemuButton,
  useNemuTheme,
} from "@/design-system";
import { NEMU_WEB_EMPTY_LIBRARY_VISUAL } from "@/lib/mobileEmptyLibraryLayout";
import { JapaneseLearningText as Text } from "./JapaneseLearningText";

interface JapaneseLearningSignInNoticeProps {
  title: string;
  description: string;
  signInLabel: string;
  /** Absent in a build without sync, which has no sign-in to show. */
  onSignIn?: () => void;
  /** A tight place (a short sheet's column): a smaller title, closer to its button. */
  compact?: boolean;
}

/**
 * A step that needs nemu's online service, signed out: the empty Library's
 * centred title, line and prominent button, not an error.
 */
export function JapaneseLearningSignInNotice({
  title,
  description,
  signInLabel,
  onSignIn,
  compact = false,
}: JapaneseLearningSignInNoticeProps) {
  const { tokens } = useNemuTheme();
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <View style={styles.copy}>
        <Text
          accessibilityRole="header"
          style={[
            compact ? nemuText.sectionTitle : [nemuText.pageEmptyTitle, styles.title],
            styles.centred,
            { color: tokens.foreground },
          ]}
        >
          {title}
        </Text>
        <Text style={[nemuText.pageEmptyDescription, styles.description, { color: tokens.mutedForeground }]}>
          {description}
        </Text>
      </View>
      {onSignIn ? (
        <NemuButton
          accessibilityLabel={signInLabel}
          containerStyle={compact ? styles.actionCompact : styles.action}
          label={signInLabel}
          onPress={onSignIn}
          size={NEMU_PROMINENT_CTA_SIZE}
          variant="default"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignSelf: "stretch",
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
  },
  centred: {
    textAlign: "center",
  },
  description: {
    lineHeight: NEMU_WEB_EMPTY_LIBRARY_VISUAL.descriptionLineHeight,
    textAlign: "center",
  },
  action: {
    marginTop: NEMU_WEB_EMPTY_LIBRARY_VISUAL.actionMarginTop,
  },
  actionCompact: {
    marginTop: 12,
  },
});
