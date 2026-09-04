import type { ReadingMode } from "@/data/schema";
import { ReaderSegmentedChipRow } from "./ReaderSegmentedChipRow";
import {
  READER_READING_MODE_ORDER,
  type ReaderReadingModePickerProps,
} from "./readerReadingModeOptions";

/**
 * Non-iOS reading-direction control. iOS gets a native segmented `Picker`
 * (`ReaderReadingModePicker.ios.tsx`); everywhere else falls back to the
 * design-system chip row.
 */
export function ReaderReadingModePicker({
  accessibilityLabel,
  disabled = false,
  labelForMode,
  mode,
  onSetMode,
}: ReaderReadingModePickerProps) {
  return (
    <ReaderSegmentedChipRow<ReadingMode>
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onChange={onSetMode}
      options={READER_READING_MODE_ORDER.map((option) => ({
        value: option,
        label: labelForMode(option),
      }))}
      value={mode}
    />
  );
}
