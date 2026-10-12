import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderNotebookPanePreference } from "@/lib/mobileReaderNotebookPane";

/** Label of a "Bottom half in notebook pose" choice. */
export function notebookPaneLabel(option: MobileReaderNotebookPanePreference, strings: MobileStrings): string {
  switch (option) {
    case "trackpad":
      return strings.duo.notebookPaneTrackpad;
    case "filmstrip":
      return strings.duo.notebookPaneFilmstrip;
    default:
      return strings.duo.notebookPaneAutomatic;
  }
}
