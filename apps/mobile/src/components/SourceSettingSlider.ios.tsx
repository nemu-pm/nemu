import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Host as SwiftHost, Slider as SwiftSlider } from "@expo/ui/swift-ui";
import { disabled as swiftDisabled, tint } from "@expo/ui/swift-ui/modifiers";
import { NemuText, useNemuTheme } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import { formatSourceSettingSliderValue, snapSourceSettingSliderValue } from "@/lib/mobileSourceSettings";
import type { SourceSettingSliderProps } from "./SourceSettingSlider.types";

/**
 * iOS: the system slider (SwiftUI), as in Settings: it tracks the finger
 * natively, owns its drag inside a sheet (no fight with swipe-to-dismiss),
 * and the value is committed once, when the drag ends. The value beside it
 * follows the thumb while dragging.
 */
export function SourceSettingSlider({ setting, value, disabled, onChange }: SourceSettingSliderProps) {
  const { scheme, tokens } = useNemuTheme();
  const min = setting.min ?? 0;
  const max = setting.max ?? 100;
  const step = setting.step ?? 1;
  // The value under the finger; null when not dragging (the stored value shows).
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const shown = draft ?? value;

  return (
    <View style={styles.row}>
      <SwiftHost colorScheme={scheme} matchContents={{ vertical: true }} style={styles.host}>
        <SwiftSlider
          value={shown}
          min={min}
          max={max}
          step={step}
          onValueChange={(next) => {
            const snapped = snapSourceSettingSliderValue(next, min, max, step);
            if (snapped === draftRef.current) return;
            const crossed = draftRef.current !== null;
            draftRef.current = snapped;
            setDraft(snapped);
            if (crossed) void hapticSelection();
          }}
          onEditingChanged={(editing) => {
            if (editing) return;
            const committed = draftRef.current;
            draftRef.current = null;
            setDraft(null);
            if (committed !== null && committed !== value) onChange(committed);
          }}
          modifiers={[tint(tokens.primary), ...(disabled ? [swiftDisabled(true)] : [])]}
        />
      </SwiftHost>
      <NemuText
        density="compact"
        numberOfLines={1}
        style={[styles.value, { color: tokens.mutedForeground }]}
      >
        {formatSourceSettingSliderValue(setting, shown)}
      </NemuText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  host: {
    flex: 1,
  },
  value: {
    minWidth: 40,
    textAlign: "right",
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
});
