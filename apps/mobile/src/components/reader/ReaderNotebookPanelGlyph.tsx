import Ionicons from "@expo/vector-icons/Ionicons";
import { MOBILE_READER_CHROME_GLYPHS } from "@/lib/mobileReaderBarIcons";
import type { ReaderNotebookPanelGlyphProps } from "./ReaderNotebookPanelGlyph.types";

/** Android and older targets: the chrome's Ionicons chevrons (down lowers the open panel, up brings it back). */
export function ReaderNotebookPanelGlyph({ open, primaryColor, secondaryColor }: ReaderNotebookPanelGlyphProps) {
  return (
    <Ionicons
      name={open ? MOBILE_READER_CHROME_GLYPHS.notebookPanelClose.name : MOBILE_READER_CHROME_GLYPHS.notebookPanel.name}
      size={MOBILE_READER_CHROME_GLYPHS.notebookPanel.size}
      color={open ? primaryColor : secondaryColor}
    />
  );
}
