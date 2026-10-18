import type { MobileStrings } from "@/lib/mobileI18n";
import { READER_FIT_MODES, type ReaderFitMode } from "@/lib/mobileReaderFit";
import { READER_SPREAD_MODES, type ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";
import type { MobileReaderSpreadPairing } from "@/lib/mobileReaderPairing";
import type { MobileReaderPageBackground } from "@/lib/mobileReaderPageBackground";
import type { MobileReaderPageTurn } from "@/lib/mobileReaderPageCurl";

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

export function readerSpreadPairingLabel(pairing: MobileReaderSpreadPairing, strings: MobileStrings): string {
  switch (pairing) {
    case "cover-alone":
      return strings.reader.pairingCoverAlone;
    case "cover-paired":
      return strings.reader.pairingCoverPaired;
    default:
      return strings.reader.pairingAutomatic;
  }
}

export function readerPageTurnLabel(turn: MobileReaderPageTurn, strings: MobileStrings): string {
  return turn === "slide" ? strings.reader.pageTurningSlide : strings.reader.pageTurningCurl;
}

export function readerPageBackgroundLabel(background: MobileReaderPageBackground, strings: MobileStrings): string {
  switch (background) {
    case "white":
      return strings.reader.pageBackgroundWhite;
    case "page":
      return strings.reader.pageBackgroundMatchPage;
    default:
      return strings.reader.pageBackgroundBlack;
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
