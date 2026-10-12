import type { MobileStrings } from "@/lib/mobileI18n";
import { READER_FIT_MODES, type ReaderFitMode } from "@/lib/mobileReaderFit";
import { READER_SPREAD_MODES, type ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";

export const READER_SPREAD_MODE_ORDER = READER_SPREAD_MODES;
export const READER_FIT_MODE_ORDER = READER_FIT_MODES;

export function readerSpreadModeLabel(mode: ReaderSpreadMode, strings: MobileStrings): string {
  switch (mode) {
    case "single":
      return strings.reader.pageLayoutSingle;
    case "double":
      return strings.reader.pageLayoutDouble;
    default:
      return strings.reader.pageLayoutAuto;
  }
}

export function readerFitModeLabel(mode: ReaderFitMode, strings: MobileStrings): string {
  switch (mode) {
    case "width":
      return strings.reader.pageFitWidth;
    case "height":
      return strings.reader.pageFitHeight;
    case "fill":
      return strings.reader.pageFitFill;
    default:
      return strings.reader.pageFitPage;
  }
}

export function readerWindowShapeLabel(shape: ReaderWindowShape, strings: MobileStrings): string {
  switch (shape) {
    case "wide":
      return strings.reader.windowShapeWide;
    case "large":
      return strings.reader.windowShapeLarge;
    default:
      return strings.reader.windowShapeNarrow;
  }
}

/** SF Symbol per fit choice for the native menu rows. */
export function readerFitModeSystemImage(mode: ReaderFitMode): string {
  switch (mode) {
    case "width":
      return "arrow.left.and.right";
    case "height":
      return "arrow.up.and.down";
    case "fill":
      return "arrow.up.left.and.arrow.down.right";
    default:
      return "rectangle.portrait";
  }
}
