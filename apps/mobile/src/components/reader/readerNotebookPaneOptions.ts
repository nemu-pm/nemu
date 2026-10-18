import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderNotebookPanePreference } from "@/lib/mobileReaderNotebookPane";

/** Label of a Laptop Mode choice (what the lower half shows). */
export function notebookPaneLabel(option: MobileReaderNotebookPanePreference, strings: MobileStrings): string {
  return option === "trackpad" ? strings.duo.notebookPaneTrackpad : strings.duo.notebookPaneFilmstrip;
}
