/**
 * Android / web / test fallback for the sheet search capsule.
 *
 * This is the previous Add Source sheet markup moved out of `BrowseScreen`
 * unchanged: an RN `TextInput` dressed as the iOS search field —
 * secondary-filled capsule, 15pt system text, muted leading magnifier, and the
 * shared `NemuTextFieldClearAction` in the trailing slot.
 *
 * iOS resolves `NemuNativeSearchField.ios.tsx` instead, which hosts a real
 * SwiftUI `TextField`. Known caveat documented there: a SwiftUI text field
 * hosted inside a sheet's own SwiftUI presentation can mis-handle first
 * responder / IME hand-off. If that shows up on device, deleting the `.ios.tsx`
 * file (or gating it behind a `Platform` switch) falls straight back to this
 * implementation with no caller changes.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import { Platform, StyleSheet, TextInput, View } from "react-native";
import { radius } from "@/design/tokens";
import { useNemuTheme } from "@/design/useNemuTheme";
import { NemuTextFieldClearAction } from "./NemuTextFieldClearAction";
import type { NemuNativeSearchFieldProps } from "./NemuNativeSearchField.types";

/**
 * Horizontal padding of the capsule; the clear action negates it to reach the edge.
 */
const SHELL_HORIZONTAL_INSET = 12;
/** Matches the iOS SwiftUI field so the platforms read identically. */
const FIELD_FONT_SIZE = 15;

export function NemuNativeSearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel,
  testID,
  clearActionTestID,
}: NemuNativeSearchFieldProps) {
  const { tokens } = useNemuTheme();

  return (
    <View
      style={[
        styles.searchShell,
        Platform.OS === "android" ? styles.androidSearchShell : null,
        { backgroundColor: tokens.secondary },
      ]}
    >
      <Ionicons name="search" size={17} color={tokens.mutedForeground} />
      <TextInput
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="search"
        autoCapitalize="none"
        autoCorrect={false}
        enterKeyHint="search"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={tokens.mutedForeground}
        returnKeyType="search"
        selectionColor={tokens.primary}
        style={[styles.searchInput, { color: tokens.foreground }]}
        testID={testID}
      />
      {value.length > 0 ? (
        <NemuTextFieldClearAction
          accessibilityLabel={clearAccessibilityLabel}
          onPress={() => onChangeText("")}
          testID={clearActionTestID}
          trailingInset={12}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // iOS search field metrics: a 36pt capsule on a secondary fill, with the
  // glyph and the 15pt text sharing one baseline. Android keeps a taller target
  // so the Material clear action fits inside the field.
  searchShell: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: SHELL_HORIZONTAL_INSET,
  },
  androidSearchShell: {
    height: 48,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    // Android's editable defaults would otherwise pad the capsule open and
    // top-align the text against the leading glyph.
    padding: 0,
    textAlignVertical: "center",
    fontSize: FIELD_FONT_SIZE,
  },
});
