import { Host as SwiftHost, Image as SwiftImage } from "@expo/ui/swift-ui";
import { background, font, frame, shapes } from "@expo/ui/swift-ui/modifiers";
import { StyleSheet, View } from "react-native";
import { MOBILE_READER_NOTEBOOK_PANEL_SYMBOL } from "@/lib/mobileReaderBarIcons";
import type { ReaderNotebookPanelGlyphProps } from "./ReaderNotebookPanelGlyph.types";

const SYMBOL = MOBILE_READER_NOTEBOOK_PANEL_SYMBOL;

/**
 * iOS: the system's `rectangle.bottomthird.inset.filled`, drawn like
 * `ReaderBackGlyph`, in the primary colour in both states. While the panel is
 * open a 36pt circle of that colour at 18% sits behind it, concentric with
 * the button; closed, there is none. The circle is SwiftUI's, drawn in the
 * glyph's own host: an RN view behind the host never showed in the glass
 * capsule. Drawing only: the pressable around it owns the touch.
 */
export function ReaderNotebookPanelGlyph({ open, primaryColor }: ReaderNotebookPanelGlyphProps) {
  return (
    <View pointerEvents="none" style={styles.root}>
      {/* The capsule already sits clear of the status bar and the Duo's
          vertical bar column; the nested host must not inset it again. */}
      <SwiftHost colorScheme="dark" ignoreSafeArea="all" style={styles.root}>
        <SwiftImage
          systemName={SYMBOL.name}
          color={primaryColor}
          modifiers={[
            font({ size: SYMBOL.pointSize, weight: SYMBOL.weight }),
            frame({ width: SYMBOL.box, height: SYMBOL.box }),
            frame({ width: SYMBOL.highlight, height: SYMBOL.highlight }),
            ...(open ? [background(highlightColor(primaryColor), shapes.circle())] : []),
          ]}
        />
      </SwiftHost>
    </View>
  );
}

/** `color` at `SYMBOL.highlightOpacity` of its own alpha (an `rgba()` / `rgb()` string; anything else as is). */
function highlightColor(color: string): string {
  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(color);
  if (!match) return color;
  const alpha = (match[4] === undefined ? 1 : Number(match[4])) * SYMBOL.highlightOpacity;
  return `rgba(${match[1]},${match[2]},${match[3]},${Math.round(alpha * 1000) / 1000})`;
}

const styles = StyleSheet.create({
  root: {
    width: SYMBOL.highlight,
    height: SYMBOL.highlight,
    alignItems: "center",
    justifyContent: "center",
  },
});
