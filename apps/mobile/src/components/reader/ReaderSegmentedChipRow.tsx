import { StyleSheet, View } from "react-native";
import {
  NemuPressable,
  NemuText,
  nemuFontWeight,
  radius,
  useNemuTheme,
} from "@/design-system";

export type ReaderSegmentedChipOption<T extends string> = {
  value: T;
  label: string;
  /** Falls back to `label` when the visible label is an abbreviation. */
  accessibilityLabel?: string;
};

export type ReaderSegmentedChipRowProps<T extends string> = {
  accessibilityLabel?: string;
  disabled?: boolean;
  options: readonly ReaderSegmentedChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * The design-system fallback for a native segmented control: a row of 30pt
 * pills. Selected pills use the toolbar-action surface so they read as the
 * same family as the reader chrome; unselected pills stay on `secondary`.
 */
export function ReaderSegmentedChipRow<T extends string>({
  accessibilityLabel,
  disabled = false,
  options,
  value,
  onChange,
}: ReaderSegmentedChipRowProps<T>) {
  const { tokens } = useNemuTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      style={styles.row}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <NemuPressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, disabled }}
            containerStyle={styles.chipContainer}
            disabled={disabled}
            hapticFeedback={selected ? "none" : "selection"}
            onPress={() => {
              if (selected) return;
              onChange(option.value);
            }}
            pressedScale={0.985}
            style={[
              styles.chip,
              {
                backgroundColor: selected
                  ? tokens.toolbarAction
                  : tokens.secondary,
                borderColor: selected
                  ? tokens.toolbarActionBorder
                  : "transparent",
                opacity: disabled ? 0.56 : 1,
              },
            ]}
          >
            <NemuText
              color={selected ? tokens.primary : tokens.secondaryForeground}
              numberOfLines={1}
              style={styles.chipLabel}
            >
              {option.label}
            </NemuText>
          </NemuPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipContainer: {
    flex: 1,
    minWidth: 0,
  },
  chip: {
    width: "100%",
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
  },
  chipLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
});
