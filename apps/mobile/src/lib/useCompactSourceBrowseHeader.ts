import { Platform } from "react-native";
import { shouldUseCompactSourceBrowseHeader } from "./mobileSourceBrowseHeader";

export function useCompactSourceBrowseHeader() {
  return shouldUseCompactSourceBrowseHeader(Platform.OS);
}
