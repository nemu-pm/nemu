import { Stack } from "expo-router";
import { hapticPress } from "@/lib/haptics";
import { MOBILE_DOWNLOAD_NEXT_COUNT } from "@/lib/downloads/mobileDownloadSelection";
import type { MobileMangaDownloads } from "@/lib/downloads/useMobileMangaDownloads";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";

/**
 * The title page's download menu, a `UIMenu` on its own bar button beside
 * the page's More menu: the bulk downloads, chapter selection, and this
 * title's queued or downloaded chapters.
 * A toolbar's direct child, so this is a render function, not a component.
 */
export function renderMobileDownloadBarMenu(
  downloads: MobileMangaDownloads,
  strings: MobileStrings,
  disabled: boolean,
) {
  if (!downloads.manga) return null;
  // Only whether this title has queued or downloaded chapters: a live count
  // here would rebuild the bar's UIMenu (and close it under the finger) each
  // time a chapter finishes.
  const queued = downloads.hasQueued;
  const downloaded = downloads.hasDownloaded;
  const action = (run: () => void) => () => {
    if (disabled) return;
    void hapticPress();
    run();
  };
  return (
    <Stack.Toolbar.Menu icon="arrow.down.circle" accessibilityLabel={strings.downloads.menu}>
      <Stack.Toolbar.MenuAction
        icon="arrow.down.circle"
        disabled={disabled}
        onPress={action(() => downloads.downloadScope({ kind: "next", count: MOBILE_DOWNLOAD_NEXT_COUNT }))}
      >
        {formatMobileString(strings.downloads.downloadNext, { count: MOBILE_DOWNLOAD_NEXT_COUNT })}
      </Stack.Toolbar.MenuAction>
      <Stack.Toolbar.MenuAction
        icon="arrow.down.to.line"
        disabled={disabled}
        onPress={action(() => downloads.downloadScope({ kind: "unread" }))}
      >
        {strings.downloads.downloadUnread}
      </Stack.Toolbar.MenuAction>
      <Stack.Toolbar.MenuAction
        icon="square.and.arrow.down.on.square"
        disabled={disabled}
        onPress={action(() => downloads.downloadScope({ kind: "all" }))}
      >
        {strings.downloads.downloadAll}
      </Stack.Toolbar.MenuAction>
      <Stack.Toolbar.MenuAction
        icon="checkmark.circle"
        disabled={disabled}
        onPress={action(downloads.selection.startSelecting)}
      >
        {strings.downloads.selectChapters}
      </Stack.Toolbar.MenuAction>
      {queued ? (
        <Stack.Toolbar.MenuAction icon="xmark.circle" onPress={action(downloads.cancelAll)}>
          {strings.downloads.cancelDownloads}
        </Stack.Toolbar.MenuAction>
      ) : null}
      {downloaded ? (
        <Stack.Toolbar.MenuAction icon="trash" destructive onPress={action(downloads.confirmRemoveAll)}>
          {strings.downloads.removeDownloads}
        </Stack.Toolbar.MenuAction>
      ) : null}
      <Stack.Toolbar.MenuAction icon="tray.full" onPress={action(downloads.openManager)}>
        {strings.downloads.manageDownloads}
      </Stack.Toolbar.MenuAction>
    </Stack.Toolbar.Menu>
  );
}

/**
 * Selection mode's bar: Cancel where Back was, and on the right Select All
 * and the confirming Download with the count.
 */
export function renderMobileDownloadSelectionToolbars(downloads: MobileMangaDownloads, strings: MobileStrings) {
  const { selection } = downloads;
  const count = selection.selected?.size ?? 0;
  return [
    <Stack.Toolbar key="selection-left" placement="left">
      <Stack.Toolbar.Button onPress={selection.stopSelecting}>{strings.common.cancel}</Stack.Toolbar.Button>
    </Stack.Toolbar>,
    <Stack.Toolbar key="selection-right" placement="right">
      <Stack.Toolbar.Button onPress={selection.toggleAll}>
        {selection.allSelected ? strings.downloads.deselectAll : strings.downloads.selectAll}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Button variant="done" disabled={count === 0} onPress={selection.downloadSelected}>
        {count > 0 ? `${strings.downloads.downloadSelected} (${count})` : strings.downloads.downloadSelected}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>,
  ];
}
