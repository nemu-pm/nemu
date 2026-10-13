import { useLayoutEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet";
import {
  MobileNativeSheetScaffold,
  NemuButton,
  nemuSheetMetrics,
  radius,
  useMobileNativeSheetTheme,
} from "@/design-system";
import type { MobileSourceDirectoryPromptProps } from "./MobileSourceDirectoryPromptSheet.types";

export const mobileSourceDirectoryPromptAvailable = true;

/**
 * Android / web: the same sheet the Library uses to name a collection (a
 * titled sheet, one text field, Cancel and the confirming button), here
 * taking an HTTPS address. iOS uses the system alert instead.
 */
export function MobileSourceDirectoryPrompt({
  visible,
  strings,
  onClose,
  onSubmit,
}: MobileSourceDirectoryPromptProps) {
  const { tokens } = useMobileNativeSheetTheme();
  const [url, setUrl] = useState("");
  const wasVisibleRef = useRef(false);
  const trimmed = url.trim();
  const disabled = trimmed.length === 0;

  useLayoutEffect(() => {
    if (visible && !wasVisibleRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl("");
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      title={strings.settings.addSourceDirectory}
      subtitle={strings.settings.addSourceDirectoryMessage}
      dismissLabel={strings.common.cancel}
      showDismissButton={false}
      contentStyle={styles.sheet}
      testID="AddSourceDirectorySheet"
    >
      <View
        style={[
          styles.inputShell,
          nemuSheetMetrics.textFieldMinHeight ? { minHeight: nemuSheetMetrics.textFieldMinHeight } : null,
          { backgroundColor: tokens.muted, borderColor: tokens.border },
        ]}
      >
        <BottomSheetTextInput
          accessibilityLabel={strings.settings.addSourceDirectory}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          keyboardType="url"
          placeholder={strings.settings.sourceDirectoryUrlPlaceholder}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType="done"
          selectionColor={tokens.primary}
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={() => {
            if (!disabled) onSubmit(trimmed);
          }}
          style={[styles.input, nemuSheetMetrics.textFieldText, { color: tokens.foreground }]}
        />
      </View>
      <View style={styles.actions}>
        <NemuButton
          accessibilityLabel={strings.common.cancel}
          containerStyle={styles.action}
          hapticFeedback="none"
          label={strings.common.cancel}
          onPress={onClose}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={strings.common.add}
          containerStyle={styles.action}
          disabled={disabled}
          label={strings.common.add}
          onPress={() => {
            if (!disabled) onSubmit(trimmed);
          }}
          variant={disabled ? "secondary" : "default"}
        />
      </View>
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: 14 },
  inputShell: {
    minHeight: 46,
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  input: { minHeight: 44, fontSize: 15, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
});
