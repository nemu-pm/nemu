import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Group as SwiftGroup,
  Host as SwiftHost,
  NavigationStack as SwiftNavigationStack,
  Popover as SwiftPopover,
  Rectangle as SwiftRectangle,
  RNHostView,
  Text as SwiftText,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
  VStack as SwiftVStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  font,
  foregroundStyle,
  frame,
  ignoreSafeArea,
  lineLimit,
  opacity,
  presentationBackground,
  presentationBackgroundInteraction,
  presentationDragIndicator,
  scrollEdgeEffectStyle,
} from "@expo/ui/swift-ui/modifiers";
import {
  fitPopoverToContent,
  fitSheetDetentToContent,
  inlineToolbarTitle,
  presentationColorScheme,
  presentationPlacement,
} from "../../../modules/nemu-window-layout/src/presentationColorScheme";
import { NemuGlassSheetThemeScope, useMobileSheetPlacement, useNemuTheme } from "@/design-system";
import {
  READER_SETTINGS_POPOVER_PAGE,
  READER_SETTINGS_SHEET_GROUP,
  READER_SETTINGS_SHEET_PAGE,
} from "@/lib/mobileFittedSheet";
import { supportsNemuLiquidGlass } from "@/lib/nemuLiquidGlass";
import {
  readerSettingsHeldNativePresentation,
  readerSettingsNativePresentation,
  readerSettingsNativeSheetEstimatedHeight,
  readerSettingsSheetDetentCap,
} from "@/lib/readerSettingsNativePopoverLayout";
import { ReaderChapterListBody } from "./ReaderChapterListBody";
import type { ReaderChapterListSheetProps } from "./ReaderChapterListSheet.types";
import { useReaderChapterListSelect } from "./useReaderChapterListSelect";

/** The rows on the sheet's material: the translucent fills on glass, before it the theme's. */
const PAGE_LOOK = supportsNemuLiquidGlass(Platform.OS, Platform.Version) ? "clear" : "opaque";

/**
 * The reader's chapter list, presented exactly as the reader settings are
 * (`ReaderSettingsNativePopover`): the same choice of sheet or popover, held
 * while it is open, and the same size, read from what the settings' own
 * off-screen copy measured. The rows are a React Native list in the page: a
 * SwiftUI List would mount every chapter.
 */
export function ReaderChapterListSheet({
  visible,
  mangaTitle,
  subtitle,
  list,
  currentChapterId,
  progressById,
  strings,
  onClose,
  onSelectChapter,
  anchor,
  availableHeight,
  regularWidth,
  maxSheetHeight,
  pageInteractive,
  settingsRows,
}: ReaderChapterListSheetProps) {
  const { scheme, tokens } = useNemuTheme();
  const sheetPlacement = useMobileSheetPlacement();
  const { select, onDismissed } = useReaderChapterListSelect(onClose, onSelectChapter);

  // Mounted for one presentation (so each opens scrolled to the open chapter)
  // and through its dismissal.
  const [listSession, setListSession] = useState({ id: 0, mounted: visible });
  if (visible && !listSession.mounted) setListSession({ id: listSession.id + 1, mounted: true });
  const handleDismiss = () => {
    if (!visible) setListSession((session) => ({ ...session, mounted: false }));
    onDismissed();
  };

  const nextPresentation = readerSettingsNativePresentation(settingsRows, {
    availableHeight,
    regularWidth: regularWidth && anchor !== null,
  });
  // Open, the kind chosen at opening holds until the room changes (rotation, fold).
  const holdKey = visible ? `${regularWidth && anchor !== null}:${Math.round(availableHeight)}` : null;
  const [held, setHeld] = useState({ key: holdKey, kind: nextPresentation.kind });
  if (held.key !== holdKey) setHeld({ key: holdKey, kind: nextPresentation.kind });
  const presentation = readerSettingsHeldNativePresentation(
    held.key === holdKey ? held.kind : null,
    nextPresentation,
    settingsRows,
  );
  const sheet = presentation.kind === "sheet" || !anchor;

  // On the presented root only, as the settings' (see there).
  const presentationModifiers = [
    presentationColorScheme(scheme),
    presentationBackground({ type: "material", material: "regular" }),
  ];

  const title = (
    <SwiftToolbarItem placement="principal">
      <SwiftVStack spacing={1}>
        <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{mangaTitle}</SwiftText>
        {subtitle ? (
          <SwiftText
            modifiers={[
              font({ textStyle: "caption" }),
              foregroundStyle({ type: "hierarchical", style: "secondary" }),
              lineLimit(1),
            ]}
          >
            {subtitle}
          </SwiftText>
        ) : null}
      </SwiftVStack>
    </SwiftToolbarItem>
  );
  const page = (
    // To the sheet's bottom edge, as the settings' Form scrolls: rows go under
    // the home indicator's strip instead of stopping short of the corners.
    <SwiftGroup modifiers={[ignoreSafeArea({ edges: "bottom" })]}>
      <RNHostView>
        <View collapsable={false} style={styles.page}>
          <NemuGlassSheetThemeScope look={PAGE_LOOK}>
            {listSession.mounted ? (
              <ReaderChapterListBody
                key={listSession.id}
                list={list}
                currentChapterId={currentChapterId}
                progressById={progressById}
                strings={strings}
                onClose={onClose}
                onSelectChapter={select}
              />
            ) : null}
          </NemuGlassSheetThemeScope>
        </View>
      </RNHostView>
    </SwiftGroup>
  );

  if (sheet) {
    const estimate = readerSettingsNativeSheetEstimatedHeight(settingsRows);
    const cap = readerSettingsSheetDetentCap({ estimatedHeight: estimate, maxHeight: maxSheetHeight });
    return (
      <View pointerEvents="none" style={styles.sheetHost}>
        <SwiftHost colorScheme={scheme} style={StyleSheet.absoluteFill}>
          <SwiftBottomSheet
            isPresented={visible}
            onIsPresentedChange={(presented) => {
              if (!presented && visible) onClose();
            }}
            onDismiss={handleDismiss}
          >
            <SwiftGroup
              modifiers={[
                fitSheetDetentToContent({
                  group: READER_SETTINGS_SHEET_GROUP,
                  page: READER_SETTINGS_SHEET_PAGE,
                  initialHeight: estimate,
                  height: cap,
                  expandable: cap === 0 && maxSheetHeight == null,
                }),
                presentationDragIndicator("visible"),
                presentationPlacement(sheetPlacement),
                ...(pageInteractive ? [presentationBackgroundInteraction("enabled")] : []),
                ...presentationModifiers,
                scrollEdgeEffectStyle("soft", "vertical"),
              ]}
            >
              <SwiftNavigationStack>
                <SwiftToolbar modifiers={[inlineToolbarTitle()]}>
                  {page}
                  <SwiftToolbar.Content>
                    <SwiftToolbarItem placement="topBarTrailing">
                      <SwiftButton
                        role="close"
                        onPress={onClose}
                        modifiers={[swiftAccessibilityLabel(strings.reader.closeChapterList)]}
                      />
                    </SwiftToolbarItem>
                    {title}
                  </SwiftToolbar.Content>
                </SwiftToolbar>
              </SwiftNavigationStack>
            </SwiftGroup>
          </SwiftBottomSheet>
        </SwiftHost>
      </View>
    );
  }
  return (
    <View
      pointerEvents="none"
      style={[styles.anchor, { left: anchor.x, top: anchor.y, width: anchor.width, height: anchor.height }]}
    >
      <SwiftHost colorScheme={scheme} seedColor={tokens.primary} style={StyleSheet.absoluteFill}>
        <SwiftPopover
          isPresented={visible}
          onIsPresentedChange={(presented) => {
            if (!presented) {
              if (visible) onClose();
              handleDismiss();
            }
          }}
        >
          <SwiftPopover.Trigger>
            <SwiftRectangle modifiers={[frame({ width: anchor.width, height: anchor.height }), opacity(0)]} />
          </SwiftPopover.Trigger>
          <SwiftPopover.Content>
            <SwiftNavigationStack
              modifiers={[
                fitPopoverToContent({
                  group: READER_SETTINGS_SHEET_GROUP,
                  page: READER_SETTINGS_POPOVER_PAGE,
                  width: presentation.kind === "popover" ? presentation.width : 0,
                  initialHeight: presentation.kind === "popover" ? presentation.height : 0,
                }),
                ...presentationModifiers,
              ]}
            >
              <SwiftToolbar modifiers={[inlineToolbarTitle()]}>
                {page}
                <SwiftToolbar.Content>{title}</SwiftToolbar.Content>
              </SwiftToolbar>
            </SwiftNavigationStack>
          </SwiftPopover.Content>
        </SwiftPopover>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
  },
  page: {
    flex: 1,
    alignSelf: "stretch",
  },
  sheetHost: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
