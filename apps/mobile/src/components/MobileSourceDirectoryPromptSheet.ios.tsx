import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Host as SwiftHost, Text as SwiftText } from "@expo/ui/swift-ui";
import { accessibilityHidden, opacity, tint } from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { NativeNameAlert } from "./MobileNativeFormSheetParts.ios";
import type { MobileSourceDirectoryPromptProps } from "./MobileSourceDirectoryPromptSheet.types";

export const mobileSourceDirectoryPromptAvailable = true;

/**
 * Add a source directory: the same system alert with one text field that
 * names a collection (`MobileCollectionNameNativeSheet`), here taking an
 * HTTPS address.
 */
export function MobileSourceDirectoryPrompt({
  visible,
  initialUrl,
  strings,
  onClose,
  onSubmit,
}: MobileSourceDirectoryPromptProps) {
  const { scheme, tokens } = useNemuTheme();
  // The alert dismisses itself on either button; `open` follows that.
  const [open, setOpen] = useState(visible);
  const [visibleSeen, setVisibleSeen] = useState(visible);
  if (visible !== visibleSeen) {
    setVisibleSeen(visible);
    if (visible) setOpen(true);
  }
  return (
    <View pointerEvents="none" style={styles.alertHost} testID="AddSourceDirectoryPrompt">
      <SwiftHost colorScheme={scheme} seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
        <NativeNameAlert
          presented={visible && open}
          title={initialUrl ? strings.settings.editSourceDirectoryUrl : strings.settings.addSourceDirectory}
          message={strings.settings.addSourceDirectoryMessage}
          placeholder={strings.settings.sourceDirectoryUrlPlaceholder}
          initialValue={initialUrl ?? ""}
          confirmLabel={initialUrl ? strings.common.save : strings.common.add}
          cancelLabel={strings.common.cancel}
          onConfirm={(url) => {
            setOpen(false);
            onSubmit(url.trim());
          }}
          onCancel={() => {
            setOpen(false);
            onClose();
          }}
        >
          <SwiftText modifiers={[tint(tokens.primary), opacity(0), accessibilityHidden(true)]}> </SwiftText>
        </NativeNameAlert>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  alertHost: { position: "absolute", left: 0, top: 0, width: 1, height: 1 },
});
