import { MOBILE_EXPLORE_RADIUS as R } from "@/lib/mobileExploreRadius";
import { Fragment } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { nemuFontWeight, NemuPressable, NemuText, useNemuTheme } from "@/design-system";

export type ExploreSettingsAction = {
  key: string;
  label: string;
  accessibilityLabel?: string;
  /** Trailing value (the size a clear frees). */
  detail?: string;
  destructive?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

const ROW_HEIGHT = 48;

/**
 * Actions as rows of one inset group (design-explore), the Settings idiom for
 * "Clear History and Website Data": the label in the accent (red when it
 * destroys), what it frees on the trailing edge, a spinner while it runs.
 * Replaces a stack of full-width bordered buttons, which read as three
 * separate cards; the explanation goes under the group as its footer.
 */
export function ExploreSettingsActionGroup({
  actions,
  footer,
}: {
  actions: ExploreSettingsAction[];
  footer?: string;
}) {
  const { tokens } = useNemuTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
        {actions.map((action, index) => {
          const disabled = action.disabled || action.busy;
          const color = action.destructive ? tokens.danger : tokens.primary;
          return (
            <Fragment key={action.key}>
              {index > 0 ? <View style={[styles.separator, { backgroundColor: tokens.border }]} /> : null}
              <NemuPressable
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel ?? action.label}
                accessibilityValue={action.detail ? { text: action.detail } : undefined}
                accessibilityState={{ disabled: disabled || undefined, busy: action.busy || undefined }}
                disabled={disabled}
                hapticFeedback={action.destructive ? "warning" : "press"}
                pressedScale={1}
                pressHighlight
                onPress={action.onPress}
                style={[styles.row, disabled && !action.busy ? styles.disabled : null]}
              >
                <NemuText numberOfLines={1} color={color} style={styles.label}>
                  {action.label}
                </NemuText>
                {action.busy ? (
                  <ActivityIndicator size="small" color={tokens.mutedForeground} />
                ) : action.detail ? (
                  <NemuText numberOfLines={1} color={tokens.mutedForeground} style={styles.detail}>
                    {action.detail}
                  </NemuText>
                ) : null}
              </NemuPressable>
            </Fragment>
          );
        })}
      </View>
      {footer ? (
        <NemuText color={tokens.mutedForeground} style={styles.footer} variant="caption">
          {footer}
        </NemuText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  group: {
    borderRadius: R.group,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: nemuFontWeight.medium,
  },
  detail: {
    fontSize: 15,
    lineHeight: 20,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  footer: {
    paddingHorizontal: 16,
  },
});
