import { Platform, Settings } from "react-native";
import {
  READER_PROCESSED_SOURCE_OPENING_KEY,
  resolveReaderProcessedSourceOpening,
  type ReaderProcessedSourceOpening,
} from "@/components/reader/readerOpeningHold";

/**
 * QA switch (see `readerOpeningHold`): `defer` | `hold`, default `defer`.
 * Switchable without a rebuild on iOS — the app's user defaults, which take
 * launch arguments too:
 *   xcrun simctl launch booted <bundle id> -NEMU_READER_PROCESSED_SOURCE_OPENING hold
 *   xcrun simctl spawn booted defaults write <bundle id> NEMU_READER_PROCESSED_SOURCE_OPENING hold
 * (read when the app starts; a written default lasts until deleted). Else the
 * build's `EXPO_PUBLIC_NEMU_READER_PROCESSED_SOURCE_OPENING`.
 */
export function getMobileReaderProcessedSourceOpening(): ReaderProcessedSourceOpening {
  let runtime: unknown;
  if (Platform.OS === "ios") {
    try {
      runtime = Settings.get(READER_PROCESSED_SOURCE_OPENING_KEY);
    } catch {
      runtime = undefined;
    }
  }
  // Expo inlines `process.env.EXPO_PUBLIC_*` member expressions at bundle time.
  return resolveReaderProcessedSourceOpening(
    runtime,
    process.env.EXPO_PUBLIC_NEMU_READER_PROCESSED_SOURCE_OPENING,
  );
}
