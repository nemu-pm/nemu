import type { ReadingMode } from "@/data/schema";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderNotebookPanePreference } from "@/lib/mobileReaderNotebookPane";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";

export type ReaderSettingsNativePopoverProps = {
  visible: boolean;
  /** The settings button's frame in reader-root coordinates; the popover's arrow points at it. */
  anchor: WindowLayoutRect | null;
  /** Height the system can give a popover beside the anchor; below the Form's height it becomes a sheet. */
  availableHeight: number;
  mode: ReadingMode;
  activeScrollWidthPct: number;
  isTwoPageMode: boolean;
  twoPageSupported: boolean;
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
  onToggleTwoPageMode: () => void;
  onTogglePagePairingMode: () => void;
  onToggleProcessPageImages: () => void;
  onPreviewScrollWidth: (value: number) => void;
  onCommitScrollWidth: (value: number) => void;
  keepAwake: boolean;
  onToggleKeepAwake: () => void;
  lockPortrait: boolean;
  onToggleLockPortrait: () => void;
  /** Foldables: what the bottom half holds in the notebook posture. */
  showNotebookPane?: boolean;
  notebookPane?: MobileReaderNotebookPanePreference;
  onSetNotebookPane?: (value: MobileReaderNotebookPanePreference) => void;
  onMarkComplete: () => void;
  showReaderPluginSettings?: boolean;
  onOpenReaderPluginSettings?: () => void;
};
