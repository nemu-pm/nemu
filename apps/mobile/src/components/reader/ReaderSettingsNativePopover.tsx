import type { ReaderSettingsNativePopoverProps } from "./ReaderSettingsNativePopover.types";

/** Android / web: the reader keeps its React Native settings popover. */
export const readerSettingsNativePopoverAvailable = false;

export function ReaderSettingsNativePopover(_props: ReaderSettingsNativePopoverProps) {
  return null;
}
