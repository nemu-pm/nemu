import type { ReadingMode } from "@/data/schema";

/** Reading directions in the order the segmented control renders them. */
export const READER_READING_MODE_ORDER: readonly ReadingMode[] = [
  "rtl",
  "ltr",
  "scrolling",
];

export type ReaderReadingModePickerProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  labelForMode: (mode: ReadingMode) => string;
  mode: ReadingMode;
  onSetMode: (mode: ReadingMode) => void;
};

export function isReaderReadingMode(value: unknown): value is ReadingMode {
  return (
    typeof value === "string" &&
    READER_READING_MODE_ORDER.includes(value as ReadingMode)
  );
}
