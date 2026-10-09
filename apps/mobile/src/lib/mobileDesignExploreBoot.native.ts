import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
  bootMobileDesignExplore,
  parseMobileDesignExploreStored,
  resolveMobileDesignExplore,
  serializeMobileDesignExploreStored,
} from "./mobileDesignExploreSwitch";

// The "New design (preview)" choice, device-local: a small file in the
// document directory read synchronously here, before the first screen (the
// settings database opens asynchronously and syncs across devices; a look is
// a per-device choice). Removed with the app, like the welcome marker.
const FILE_NAME = "nemu-design-preview-v1.json";

export function readMobileDesignExploreStored(): boolean | null {
  try {
    const file = new File(Paths.document, FILE_NAME);
    return file.exists ? parseMobileDesignExploreStored(file.textSync()) : null;
  } catch {
    return null;
  }
}

export function writeMobileDesignExploreStored(value: boolean): void {
  new File(Paths.document, FILE_NAME).writeSync(serializeMobileDesignExploreStored(value));
}

/** The value this run uses, resolved once when the bundle starts. */
export const mobileDesignExploreBooted = bootMobileDesignExplore(
  resolveMobileDesignExplore({
    platform: Platform.OS,
    stored: Platform.OS === "ios" ? readMobileDesignExploreStored() : null,
  }),
);
