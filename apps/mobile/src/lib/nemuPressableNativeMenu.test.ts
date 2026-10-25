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
  NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS,
  NATIVE_MENU_PRESS_VERDICT_CAP_MS,
  createNativeContextMenuPressGate,
  type NativeContextMenuPressScheduler,
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
    expect(pressable).toContain("nativeMenuGate.resolvePress(nativeContextMenuPressTime(event), press)");
    expect(pressable).not.toContain("setTimeout(");
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

  /** A manual clock: timers run only when the test advances it. */
  function harness() {
    let now = 0;
    let timers: { at: number; run: () => void; handle: number }[] = [];
    let nextHandle = 1;
    const scheduler: NativeContextMenuPressScheduler = {
      set: (run, ms) => {
        const handle = nextHandle++;
        timers.push({ at: now + ms, run, handle });
        return handle;
      },
      clear: (handle) => {
        timers = timers.filter((timer) => timer.handle !== handle);
      },
    };
    const advance = (ms: number) => {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      for (const timer of due) timer.run();
    };
    let presses = 0;
    const press = () => {
      presses += 1;
    };
    return { gate: createNativeContextMenuPressGate(scheduler), advance, press, presses: () => presses, pendingTimers: () => timers.length };
  }

  test("a quick tap presses at once, with no timer", () => {
    const { gate, press, presses, pendingTimers } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(1000 + NATIVE_MENU_PRESS_DEFER_FROM_MS - 1), press)).toBe("fire");
    expect(presses()).toBe(1);
    expect(pendingTimers()).toBe(0);
  });

  test("the menu presenting during the hold drops the release, even before RN's long-press timer", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    gate.menuWillDisplay();
    expect(gate.resolvePress(at(1420), press)).toBe("suppress");
    expect(presses()).toBe(0);
  });

  test("build 9, 420 ms: the menu shows well after the release — the press waits for it and is dropped", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(); // ~160 ms
    expect(gate.resolvePress(at(1420), press)).toBe("defer");
    advance(300); // well past the old fixed 150 ms wait
    expect(presses()).toBe(0);
    gate.menuWillDisplay();
    gate.menuWillEnd();
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(0);
  });

  test("build 9 trace #32/#33: the lift cancelled (willEnd, no display) presses then, not after a timer", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(1424), press)).toBe("defer");
    expect(presses()).toBe(0);
    gate.menuWillEnd();
    expect(presses()).toBe(1);
  });

  test("a willEnd without a display that reached JS before the release presses at once", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    gate.menuWillEnd();
    expect(gate.resolvePress(at(1400), press)).toBe("fire");
    expect(presses()).toBe(1);
  });

  test("no verdict at all: the press runs at the cap (never lost), once", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(1300), press)).toBe("defer");
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS - 1);
    expect(presses()).toBe(0);
    advance(1);
    expect(presses()).toBe(1);
    gate.menuWillEnd();
    expect(presses()).toBe(1);
  });

  test("no configure by the release: a short wait, then the press (no menu can follow)", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1300), press)).toBe("defer");
    advance(NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS);
    expect(presses()).toBe(1);
  });

  test("a configure that reaches JS after the release switches to waiting for the verdict", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1450), press)).toBe("defer");
    gate.menuConfigure();
    advance(NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS + 200);
    expect(presses()).toBe(0);
    gate.menuWillDisplay();
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(0);
  });

  test("a next touch ends a waiting press without a menu: it presses, once", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(1300), press)).toBe("defer");
    gate.pressIn(at(1500));
    expect(presses()).toBe(1);
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(1);
  });

  test("the release stays dropped after the menu went away, until the next pressIn", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuWillDisplay();
    gate.menuWillEnd();
    expect(gate.resolvePress(at(1200), press)).toBe("suppress");
    gate.pressIn(at(5000));
    expect(gate.resolvePress(at(5080), press)).toBe("fire");
    expect(presses()).toBe(1);
  });

  test("a hold past the long-press threshold is never a tap (drift cancelled RN's timer, no menu signal)", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1000 + NATIVE_MENU_LONG_PRESS_MS), press)).toBe("suppress");
    gate.menuWillEnd();
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(0);
  });

  test("Pressability's own long press ends the sequence's tap", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.longPress();
    expect(gate.resolvePress(at(1300), press)).toBe("suppress");
    gate.menuWillEnd();
    expect(presses()).toBe(0);
  });

  test("a press while the menu is up is dropped; a press without a touch (accessibility) is not", () => {
    const { gate, press } = harness();
    expect(gate.resolvePress(at(10), press)).toBe("fire");
    gate.menuWillDisplay();
    expect(gate.resolvePress(at(20), press)).toBe("suppress");
    gate.pressIn(at(30)); // a touch that lands while the menu is still up
    expect(gate.resolvePress(at(60), press)).toBe("suppress");
    gate.menuWillEnd();
    gate.pressIn(at(100));
    expect(gate.resolvePress(at(150), press)).toBe("fire");
  });

  test("touch timestamps win over the JS clock, which a busy JS thread skews", () => {
    const { gate, press } = harness();
    // JS saw pressIn late (wall 1400) and release at 1450, but the finger was down 700 ms.
    gate.pressIn({ native: 100, wall: 1400 });
    expect(gate.resolvePress({ native: 800, wall: 1450 }, press)).toBe("suppress");
    // Without touch timestamps the JS clock is used.
    gate.pressIn({ wall: 0 });
    expect(gate.resolvePress({ wall: 50 }, press)).toBe("fire");
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
    expect(swift).toContain("onMenuConfigure([:])");
    expect(read("modules/nemu-window-layout/src/ContextMenu.native.tsx")).toContain(
      "onMenuConfigure={gate.menuConfigure}",
    );
  });
});
