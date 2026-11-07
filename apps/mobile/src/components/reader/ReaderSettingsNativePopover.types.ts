import type { ReadingMode } from "@/data/schema";
import type { MobileReaderSpreadPairing } from "@/lib/mobileReaderPairing";
import type { MobileReaderPageBackground } from "@/lib/mobileReaderPageBackground";
import type { MobileReaderPageTurn } from "@/lib/mobileReaderPageCurl";
import type { ReaderFitMode } from "@/lib/mobileReaderFit";
import type { ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import type { ReaderPluginSettingsSheetProps } from "./ReaderPluginSettingsSheet.types";

/**
 * The reader's plugins for the Plugins page pushed inside the settings sheet
 * / popover (the same React Native pages as the reader's Plugins sheet).
 */
export type ReaderSettingsPluginPages = Pick<
  ReaderPluginSettingsSheetProps,
  | "plugins"
  | "loading"
  | "error"
  | "loadError"
  | "busy"
  | "retryingLoad"
  | "canRetryLoadError"
  | "onDismissError"
  | "onDismissLoadError"
  | "onRetryLoad"
  | "onTogglePlugin"
  | "onResetPlugin"
  | "onChangePluginValue"
>;

export type ReaderSettingsNativePopoverProps = {
  visible: boolean;
  /** The settings button's frame in reader-root coordinates; the popover's arrow points at it. */
  anchor: WindowLayoutRect | null;
  /** Height the system can give a popover beside the anchor; below the Form's height it becomes a sheet. */
  availableHeight: number;
  /** Regular-width window (Duo inner display, tablets): only there may it be a popover; compact is a sheet. */
  regularWidth: boolean;
  /** Tallest the sheet may be (the bottom pane while the device is half folded like a laptop); null: no cap. */
  maxSheetHeight?: number | null;
  /** iOS book posture: the sheet sits beside the page, which stays undimmed and interactive. */
  pageInteractive?: boolean;
  mode: ReadingMode;
  activeScrollWidthPct: number;
  isTwoPageMode: boolean;
  /** Paged reading: the page layout and page fit choices apply (not scroll / long strip). */
  twoPageSupported: boolean;
  /** The saved single / double / auto choice (not whether a spread shows right now: `isTwoPageMode`). */
  spreadMode: ReaderSpreadMode;
  onSetSpreadMode: (mode: ReaderSpreadMode) => void;
  /** Page fit remembered for the window shape the pages sit in now. */
  fitMode: ReaderFitMode;
  windowShape: ReaderWindowShape;
  onSetFitMode: (mode: ReaderFitMode) => void;
  /** What shows around the page (paged reading). */
  pageBackground: MobileReaderPageBackground;
  onSetPageBackground: (value: MobileReaderPageBackground) => void;
  /** 翻页 (Page Turning): a menu row in paged reading, where this binary can curl. */
  showPageTurn?: boolean;
  pageTurn?: MobileReaderPageTurn;
  onSetPageTurn?: (value: MobileReaderPageTurn) => void;
  showCameraMode?: boolean;
  avoidCamera?: boolean;
  onSetAvoidCamera?: (enabled: boolean) => void;
  showPagePairingControls: boolean;
  /** How pages pair into spreads (自动 / 封面单独 / 封面合页). */
  spreadPairing: MobileReaderSpreadPairing;
  /** This chapter is shifted by one page (错开一页). */
  pairingShifted: boolean;
  processPageImages: boolean;
  busy: boolean;
  saving: boolean;
  completed: boolean;
  strings: MobileStrings;
  onClose: () => void;
  onSetMode: (mode: ReadingMode) => void;
  onSetSpreadPairing: (value: MobileReaderSpreadPairing) => void;
  /** Shifts this manga's pairing by one page from the current chapter on. */
  onShiftPairing: () => void;
  onToggleProcessPageImages: () => void;
  onPreviewScrollWidth: (value: number) => void;
  onCommitScrollWidth: (value: number) => void;
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
  /** Orientation Lock row: only where the reader can rotate (Duo inner display, iPad, Android). */
  showOrientationLock?: boolean;
  lockPortrait: boolean;
  onToggleLockPortrait: () => void;
  onMarkComplete: () => void;
  /** The Plugins row (it pushes the plugin pages; needs `readerPlugins`). */
  showReaderPluginSettings?: boolean;
  readerPlugins?: ReaderSettingsPluginPages;
};
