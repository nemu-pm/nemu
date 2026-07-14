export type MobileReaderHardwareBackAction =
  | "close-plugin"
  | "show-controls"
  | "navigate-back";

export function getMobileReaderHardwareBackAction({
  hasActivePlugin,
  showControls,
}: {
  hasActivePlugin: boolean;
  showControls: boolean;
}): MobileReaderHardwareBackAction {
  if (hasActivePlugin) return "close-plugin";
  if (!showControls) return "show-controls";
  return "navigate-back";
}
