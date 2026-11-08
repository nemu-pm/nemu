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
import { useMobileDesignExplore } from "@/lib/mobileDesignExplore";
import {
  MOBILE_LIBRARY_OPTIONS_FLOATING_SHEET_WIDTH,
  MOBILE_LIBRARY_OPTIONS_FLOATING_WINDOW_WIDTH,
  getMobileLibraryOptionsFooterLines,
  getMobileLibraryOptionsNativeSheetHeight,
} from "@/lib/mobileLibraryOptionsSheetLayout";
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
  const { fontScale, height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Design-explore: the rows start under the bar, not below an empty band.
  const tightTop = useMobileDesignExplore();
  const inLibrary = mode === "in-library";
  const sections = inLibrary ? [1, 1] : [canAddAndRead ? 2 : 1];
  // What the actions do: both when Add and Start Reading is offered.
  const footer = inLibrary
    ? strings.sourceManga.libraryOptionsDescription
    : canAddAndRead
      ? strings.sourceManga.addOptionsDescription
      : strings.sourceManga.addOptionsDescriptionAddOnly;
  // A wide window (the iPhone Duo inner display, a landscape phone, an iPad)
  // floats the sheet clear of its bottom edge at about a form's width: no
  // home-indicator inset is added below the detent there, so the sheet keeps
  // its own room under the footer (it was cut off at the sheet's edge).
  const floating = width >= MOBILE_LIBRARY_OPTIONS_FLOATING_WINDOW_WIDTH;
  const sheetHeight = getMobileLibraryOptionsNativeSheetHeight({
    sections: error ? [...sections, 1] : sections,
    footerLines: getMobileLibraryOptionsFooterLines(
      footer,
      floating ? Math.min(width, MOBILE_LIBRARY_OPTIONS_FLOATING_SHEET_WIDTH) : width,
      fontScale,
    ),
    fontScale,
    maxHeight: height - insets.top,
    tightTop,
    bottomInset: floating ? 0 : insets.bottom,
  });
  const busyModifiers = busy ? [swiftDisabled(true)] : [];

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={inLibrary ? strings.sourceManga.libraryOptionsTitle : strings.sourceManga.addOptionsTitle}
      detents={[{ height: sheetHeight }]}
      tightTop={tightTop}
      // iPad: a centred form sheet, not a short card floating mid-screen.
      padSizing="form"
      interactiveDismissDisabled={busy}
      closeAccessibilityLabel={strings.common.close}
      testID="SourceMangaLibraryOptionsSheet"
    >
      {inLibrary ? (
        <>
          <SwiftSection footer={<SwiftText>{footer}</SwiftText>}>
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
        <SwiftSection footer={<SwiftText>{footer}</SwiftText>}>
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
