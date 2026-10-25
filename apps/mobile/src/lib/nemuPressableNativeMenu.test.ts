import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NEMU_PRESSABLE_NOOP_LONG_PRESS,
  resolveNemuPressableLongPress,
} from "./nemuPressable";

const read = (relative: string) =>
  readFileSync(path.join(import.meta.dir, "..", "..", relative), "utf8");

describe("long press inside a native context menu", () => {
  test("a pressable without its own handler claims the long press with a no-op", () => {
    expect(
      resolveNemuPressableLongPress({ onLongPress: undefined, nativeMenuOwnsLongPress: true }),
    ).toBe(NEMU_PRESSABLE_NOOP_LONG_PRESS);
    expect(NEMU_PRESSABLE_NOOP_LONG_PRESS()).toBeUndefined();
  });

  test("outside a menu nothing changes; an own handler always wins", () => {
    expect(
      resolveNemuPressableLongPress({ onLongPress: undefined, nativeMenuOwnsLongPress: false }),
    ).toBeUndefined();
    const own = () => {};
    expect(resolveNemuPressableLongPress({ onLongPress: own, nativeMenuOwnsLongPress: true })).toBe(own);
    expect(resolveNemuPressableLongPress({ onLongPress: own, nativeMenuOwnsLongPress: false })).toBe(own);
  });

  test("the native menu provides the context only when it has items", () => {
    const menu = read("modules/nemu-window-layout/src/ContextMenu.native.tsx");
    expect(menu).toContain("items.length > 0 ? (");
    expect(menu).toContain("<NativeContextMenuLongPressContext.Provider value>");
    // The plain-view fallback (Android, older binaries) never claims it.
    expect(read("modules/nemu-window-layout/src/ContextMenu.tsx")).not.toContain(
      "NativeContextMenuLongPressContext",
    );
  });

  test("NemuPressable reads the context and routes onLongPress through the resolver", () => {
    const pressable = read("src/design-system/components/NemuPressable.tsx");
    expect(pressable).toContain("useNativeContextMenuOwnsLongPress()");
    expect(pressable).toContain("onLongPress={resolveNemuPressableLongPress({");
  });

  test("every quick-menu site wraps a NemuPressable inside the shared menu", () => {
    const quick = read("src/components/MobileQuickActionMenu.tsx");
    expect(quick).toContain("<ContextMenuView");
    for (const file of [
      "src/screens/LibraryScreen.tsx",
      "src/components/explore/MobileLibraryShelfCell.tsx",
      "src/components/explore/MobileContinueReadingCarousel.tsx",
      "src/screens/BrowseScreen.tsx",
      "src/screens/SearchScreen.tsx",
      "src/screens/SettingsScreen.tsx",
    ]) {
      expect(read(file)).toContain("<MobileQuickActionMenu");
    }
    expect(read("src/screens/SourceBrowseScreen.tsx")).toContain("<ContextMenuView");
    expect(read("src/components/explore/MobileExploreChapterRow.tsx")).toContain("<ContextMenuView");
  });
});
