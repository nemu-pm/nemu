import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button as SwiftButton,
  HStack as SwiftHStack,
  Label as SwiftLabel,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityHint as swiftAccessibilityHint,
  disabled as swiftDisabled,
  foregroundStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { getMobileLibraryOptionsNativeSheetHeight } from "@/lib/mobileLibraryOptionsSheetLayout";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import type { MobileLibraryOptionsSheetProps } from "./MobileLibraryOptionsSheet.types";

/**
 * The manga page's library button as a native sheet: a short grouped Form of
 * actions (Add / Add and Start Reading, or Collections / Remove), the
 * description as the section footer, the system close button and a detent
 * sized to its rows.
 */
export function MobileLibraryOptionsSheet({
  visible,
  mode,
  strings,
  busy,
  adding,
  canAddAndRead,
  error,
  onClose,
  onDismiss,
  onAdd,
  onAddAndRead,
  onManageCollections,
  onRemove,
}: MobileLibraryOptionsSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const inLibrary = mode === "in-library";
  const sections = inLibrary ? [1, 1] : [canAddAndRead ? 2 : 1];
  const sheetHeight = getMobileLibraryOptionsNativeSheetHeight({
    sections: error ? [...sections, 1] : sections,
    footerLines: 2,
    fontScale,
    maxHeight: height - insets.top,
  });
  const busyModifiers = busy ? [swiftDisabled(true)] : [];

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={inLibrary ? strings.sourceManga.libraryOptionsTitle : strings.sourceManga.addOptionsTitle}
      detents={[{ height: sheetHeight }]}
      interactiveDismissDisabled={busy}
      closeAccessibilityLabel={strings.common.done}
      testID="SourceMangaLibraryOptionsSheet"
    >
      {inLibrary ? (
        <>
          <SwiftSection footer={<SwiftText>{strings.sourceManga.libraryOptionsDescription}</SwiftText>}>
            <SwiftButton
              label={strings.sourceManga.manageCollections}
              systemImage="rectangle.stack"
              onPress={onManageCollections}
              modifiers={[swiftAccessibilityHint(strings.sourceManga.manageCollectionsHint), ...busyModifiers]}
            />
          </SwiftSection>
          <SwiftSection>
            <SwiftButton
              label={strings.sourceManga.removeFromLibrary}
              systemImage="trash"
              role="destructive"
              onPress={onRemove}
              modifiers={[swiftAccessibilityHint(strings.sourceManga.removeFromLibraryHint), ...busyModifiers]}
            />
          </SwiftSection>
        </>
      ) : (
        <SwiftSection footer={<SwiftText>{strings.sourceManga.addOptionsDescription}</SwiftText>}>
          {adding ? (
            <SwiftHStack spacing={10}>
              <SwiftProgressView />
              <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
                {strings.sourceManga.addToLibrary}
              </SwiftText>
            </SwiftHStack>
          ) : (
            <SwiftButton
              label={strings.sourceManga.addToLibrary}
              systemImage="bookmark"
              onPress={onAdd}
              modifiers={[swiftAccessibilityHint(strings.sourceManga.addToLibraryHint), ...busyModifiers]}
            />
          )}
          {canAddAndRead ? (
            <SwiftButton
              label={strings.sourceManga.addAndStartReading}
              systemImage="play"
              onPress={onAddAndRead}
              modifiers={[swiftAccessibilityHint(strings.sourceManga.addAndStartReadingHint), ...busyModifiers]}
            />
          ) : null}
        </SwiftSection>
      )}
      {error ? (
        <SwiftSection>
          <SwiftLabel
            title={error}
            systemImage="exclamationmark.triangle"
            color={tokens.danger}
            modifiers={[foregroundStyle(tokens.danger)]}
          />
        </SwiftSection>
      ) : null}
    </MobileNativeFormSheet>
  );
}
