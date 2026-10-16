import type { ReadingMode } from "@/data/schema";
import type { ReaderFitMode } from "@/lib/mobileReaderFit";
import type { ReaderSpreadMode } from "@/lib/mobileReaderSpreadMode";
import type { ReaderWindowShape } from "@/lib/mobileReaderWindowShape";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderNotebookPanePreference } from "@/lib/mobileReaderNotebookPane";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

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
  showCameraMode?: boolean;
  avoidCamera?: boolean;
  onSetAvoidCamera?: (enabled: boolean) => void;
  showPagePairingControls: boolean;
  pagePairingMode: "book" | "manga";
  processPageImages: boolean;
  busy: boolean;
  saving: boolean;
  completed: boolean;
  strings: MobileStrings;
  onClose: () => void;
  onDismissComplete?: () => void;
  onSetMode: (mode: ReadingMode) => void;
  onTogglePagePairingMode: () => void;
  onToggleProcessPageImages: () => void;
  onPreviewScrollWidth: (value: number) => void;
  onCommitScrollWidth: (value: number) => void;
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
  /** Orientation Lock row: only where the reader can rotate (Duo inner display, iPad, Android). */
  showOrientationLock?: boolean;
  lockPortrait: boolean;
  onToggleLockPortrait: () => void;
  /** Foldables: what the bottom half holds in the notebook posture. */
  showNotebookPane?: boolean;
  notebookPane?: MobileReaderNotebookPanePreference;
  thumbnailSpoilerSafe?: boolean;
  onToggleThumbnailSpoilerSafe?: () => void;
  onSetNotebookPane?: (value: MobileReaderNotebookPanePreference) => void;
  onMarkComplete: () => void;
  showReaderPluginSettings?: boolean;
  onOpenReaderPluginSettings?: () => void;
};
