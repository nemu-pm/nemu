import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NEMU_PRESSABLE_NOOP_LONG_PRESS,
  resolveNemuPressableLongPress,
} from "./nemuPressable";
import {
  NATIVE_MENU_LONG_PRESS_MS,
  NATIVE_MENU_PRESS_DEFER_FROM_MS,
  createNativeContextMenuPressGate,
  nativeContextMenuPressTime,
} from "../../modules/nemu-window-layout/src/ContextMenuLongPress";

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
    expect(menu).toContain("<NativeContextMenuLongPressContext.Provider value={gate}>");
    expect(menu).toContain("onMenuWillDisplay={gate.menuWillDisplay}");
    expect(menu).toContain("onMenuWillEnd={gate.menuWillEnd}");
    // The plain-view fallback (Android, older binaries) never claims it.
    expect(read("modules/nemu-window-layout/src/ContextMenu.tsx")).not.toContain(
      "NativeContextMenuLongPressContext",
    );
  });

  test("NemuPressable reads the context and routes onLongPress through the resolver", () => {
    const pressable = read("src/design-system/components/NemuPressable.tsx");
    expect(pressable).toContain("useNativeContextMenuPressGate()");
    expect(pressable).toContain("nativeMenuGate?.pressIn(nativeContextMenuPressTime(event))");
    expect(pressable).toContain("nativeMenuGate.resolvePress(nativeContextMenuPressTime(event))");
    expect(pressable).toContain("nativeMenuGate?.resolveDeferredPress() === \"fire\"");
    expect(pressable).toContain("onLongPress={withNativeMenuLongPress(");
    expect(pressable).toContain("resolveNemuPressableLongPress({");
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

describe("native context menu press gate", () => {
  const at = (native: number) => ({ native, wall: 0 });

  test("a quick tap presses at once", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1100))).toBe("fire");
  });

  test("the menu presenting during the hold drops the release, even before RN's long-press timer", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    gate.menuWillDisplay(); // device: lifted at ~0.35-0.5 s
    expect(gate.resolvePress(at(1420))).toBe("suppress");
  });

  test("the release stays dropped after the menu went away, until the next pressIn", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    gate.menuWillDisplay();
    gate.menuWillEnd();
    expect(gate.resolvePress(at(1200))).toBe("suppress");
    gate.pressIn(at(5000));
    expect(gate.resolvePress(at(5080))).toBe("fire");
  });

  test("a hold past the long-press threshold is never a tap (drift cancelled RN's timer, no menu signal)", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1000 + NATIVE_MENU_LONG_PRESS_MS))).toBe("suppress");
    expect(gate.resolveDeferredPress()).toBe("suppress");
  });

  test("Pressability's own long press ends the sequence's tap", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    gate.longPress();
    expect(gate.resolvePress(at(1300))).toBe("suppress");
  });

  test("a medium hold waits: a willDisplay that arrives after the release still drops it", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1000 + NATIVE_MENU_PRESS_DEFER_FROM_MS))).toBe("defer");
    gate.menuWillDisplay();
    expect(gate.resolveDeferredPress()).toBe("suppress");
  });

  test("a medium hold with no menu presses after the wait", () => {
    const gate = createNativeContextMenuPressGate();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1300))).toBe("defer");
    expect(gate.resolveDeferredPress()).toBe("fire");
  });

  test("a press while the menu is up is dropped; a press without a touch (accessibility) is not", () => {
    const gate = createNativeContextMenuPressGate();
    expect(gate.resolvePress(at(10))).toBe("fire");
    gate.menuWillDisplay();
    expect(gate.resolvePress(at(20))).toBe("suppress");
    gate.pressIn(at(30)); // a touch that lands while the menu is still up
    expect(gate.resolvePress(at(60))).toBe("suppress");
    gate.menuWillEnd();
    gate.pressIn(at(100));
    expect(gate.resolvePress(at(150))).toBe("fire");
  });

  test("touch timestamps win over the JS clock, which a busy JS thread skews", () => {
    const gate = createNativeContextMenuPressGate();
    // JS saw pressIn late (wall 1400) and release at 1450, but the finger was down 700 ms.
    gate.pressIn({ native: 100, wall: 1400 });
    expect(gate.resolvePress({ native: 800, wall: 1450 })).toBe("suppress");
    // Without touch timestamps the JS clock is used.
    gate.pressIn({ wall: 0 });
    expect(gate.resolvePress({ wall: 50 })).toBe("fire");
    expect(nativeContextMenuPressTime({ nativeEvent: { timestamp: 42 } }).native).toBe(42);
    expect(nativeContextMenuPressTime({ nativeEvent: {} }).native).toBeUndefined();
    expect(nativeContextMenuPressTime(undefined).native).toBeUndefined();
  });

  test("the native view reports the menu presenting and ending", () => {
    const swift = read("modules/nemu-window-layout/ios/NemuWindowLayoutModule.swift");
    expect(swift).toMatch(/Events\("onMenuAction", "onMenuWillDisplay", "onMenuWillEnd"/);
    expect(swift).toContain("willDisplayMenuFor configuration: UIContextMenuConfiguration");
    expect(swift).toContain("onMenuWillDisplay([:])");
    expect(swift).toContain("onMenuWillEnd([:])");
  });
});
