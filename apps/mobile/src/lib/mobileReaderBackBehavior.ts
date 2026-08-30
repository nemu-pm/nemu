export type MobileReaderHardwareBackAction =
  | "dismiss-end-prompt"
  | "close-plugin"
  | "show-controls"
  | "navigate-back";

export function getMobileReaderHardwareBackAction({
  hasActivePlugin,
  hasEndOfChapterPrompt = false,
  showControls,
}: {
  hasActivePlugin: boolean;
  hasEndOfChapterPrompt?: boolean;
  showControls: boolean;
}): MobileReaderHardwareBackAction {
  if (hasEndOfChapterPrompt) return "dismiss-end-prompt";
  if (hasActivePlugin) return "close-plugin";
  if (!showControls) return "show-controls";
  return "navigate-back";
}
