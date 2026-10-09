import type { ReactElement } from "react";
import {
  Button as SwiftButton,
  Host as SwiftHost,
  Image as SwiftImage,
  Label as SwiftLabel,
  Menu as SwiftMenu,
  Section as SwiftSection,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityHint as swiftAccessibilityHint,
  accessibilityLabel as swiftAccessibilityLabel,
  contentShape,
  disabled as swiftDisabled,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";
import { StyleSheet, View } from "react-native";
import { hapticSelection } from "@/lib/haptics";
import type { ReaderMoreMenuProps } from "./ReaderMoreMenu.types";

const SIZE = 44;

/**
 * iOS: the ⋯ glyph is the label of a SwiftUI `Menu`, so a tap opens the real
 * system menu (iOS 26 morphs it out of the glass circle) with native
 * sections, SF Symbols, disabled rows and VoiceOver — nothing RN-drawn. The
 * glass circle around it is the reader's `ReaderCapsule`, so it shows and
 * hides with the other pieces.
 */
export function ReaderMoreMenu({
  sections,
  accessibilityLabel,
  accessibilityHint,
  color,
  onAction,
  onInteract,
}: ReaderMoreMenuProps) {
  return (
    <View style={styles.root} onTouchStart={onInteract}>
      <SwiftHost colorScheme="dark" style={styles.host}>
        <SwiftMenu
          label={
            <SwiftImage
              systemName="ellipsis"
              size={18}
              color={color}
              modifiers={[frame({ width: SIZE, height: SIZE }), contentShape(shapes.circle())]}
            />
          }
          modifiers={[
            swiftAccessibilityLabel(accessibilityLabel),
            swiftAccessibilityHint(accessibilityHint),
          ]}
        >
          {sections.map((section) => (
            <SwiftSection key={section.id}>
              {section.items.map((item) => {
                const content: ReactElement[] = [
                  <SwiftLabel key="title" title={item.title} systemImage={item.systemImage as SFSymbol} />,
                ];
                // A second Text is the menu row's subtitle (the chapter it opens).
                if (item.subtitle) content.push(<SwiftText key="subtitle">{item.subtitle}</SwiftText>);
                return (
                  <SwiftButton
                    key={item.id}
                    modifiers={[
                      swiftAccessibilityLabel(item.accessibilityLabel),
                      ...(item.disabled ? [swiftDisabled(true)] : []),
                    ]}
                    onPress={() => {
                      if (item.disabled) return;
                      void hapticSelection();
                      onAction(item.id);
                    }}
                  >
                    {content}
                  </SwiftButton>
                );
              })}
            </SwiftSection>
          ))}
        </SwiftMenu>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
  },
  host: {
    width: SIZE,
    height: SIZE,
  },
});
