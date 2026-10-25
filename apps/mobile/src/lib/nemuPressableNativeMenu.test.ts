import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NEMU_PRESSABLE_NOOP_LONG_PRESS,
  resolveNemuPressableLongPress,
} from "./nemuPressable";
import {
  NATIVE_MENU_CONFIGURED_TAP_MAX_MS,
  NATIVE_MENU_LONG_PRESS_MS,
  NATIVE_MENU_PRESS_DEFER_FROM_MS,
  NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS,
  NATIVE_MENU_PRESS_VERDICT_CAP_MS,
  NATIVE_MENU_TAP_SLOP_PT,
  NATIVE_MENU_UNSTAMPED_CANCEL_BEFORE_RELEASE_MS,
  createNativeContextMenuPressGate,
  nativeContextMenuEventActive,
  nativeContextMenuEventTime,
  nativeMenuLiftCancelledWhileHeld,
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
    expect(menu).toContain("gate.menuWillDisplay(nativeContextMenuEventTime(event))");
    expect(menu).toContain("gate.menuWillEnd(nativeContextMenuEventTime(event), nativeContextMenuEventActive(event))");
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

  test("build 9, 420 ms: the menu shows well after the release — the release is dropped at once, the menu still shows", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(); // ~160 ms
    expect(gate.resolvePress(at(1420), press)).toBe("suppress");
    advance(300);
    expect(presses()).toBe(0);
    gate.menuWillDisplay();
    gate.menuWillEnd();
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(0);
  });

  test("build 9 r3 bgfgB3 #29: a 425 ms still press whose lift ended with the release (no display) never opens", () => {
    // configure +166, onPress -> defer at +414 [touch +425], willEnd +414 unstamped:
    // the old gate fired the deferred press ("lift ended by the release").
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(1425), press)).toBe("suppress");
    gate.menuWillEnd();
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(0);
    // The other order (willEnd first, then the release): also dropped.
    gate.pressIn(at(3000));
    gate.menuConfigure();
    gate.menuWillEnd();
    expect(gate.resolvePress(at(3425), press)).toBe("suppress");
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(0);
  });

  test("past the configured-tap limit every order drops the release; at or below it a release-ended lift still taps", () => {
    const { gate, advance, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(1000 + NATIVE_MENU_CONFIGURED_TAP_MAX_MS + 1), press)).toBe("suppress");
    gate.pressIn(at(2000));
    gate.menuConfigure();
    expect(gate.resolvePress(at(2000 + NATIVE_MENU_CONFIGURED_TAP_MAX_MS), press)).toBe("defer");
    gate.menuWillEnd();
    expect(presses()).toBe(1);
    // A configure that reaches JS only after a long release: dropped then.
    gate.pressIn(at(4000));
    expect(gate.resolvePress(at(4400), press)).toBe("defer");
    gate.menuConfigure();
    gate.menuWillEnd();
    advance(NATIVE_MENU_PRESS_VERDICT_CAP_MS);
    expect(presses()).toBe(1);
    // A long hold UIKit never configured (no lift began): the short wait, then the press.
    gate.pressIn(at(6000));
    expect(gate.resolvePress(at(6400), press)).toBe("defer");
    advance(NATIVE_MENU_PRESS_UNCONFIGURED_WAIT_MS);
    expect(presses()).toBe(2);
  });

  test("unstamped (build 9 r3 binary): a willEnd that reached JS well before the release was a cancel under the finger", () => {
    let clock = 10_000;
    const gate = createNativeContextMenuPressGate(undefined, () => clock);
    let presses = 0;
    const press = () => {
      presses += 1;
    };
    // 300 ms with drift: cancelled at ~200 ms, released at 300.
    gate.pressIn({ native: 1000, wall: clock });
    gate.menuConfigure();
    clock += 200;
    gate.menuWillEnd();
    clock += 100;
    expect(gate.resolvePress({ native: 1300, wall: clock }, press)).toBe("suppress");
    // A 300 ms tap: the release ended the lift, both reach JS together.
    gate.pressIn({ native: 2000, wall: clock });
    gate.menuConfigure();
    clock += 300;
    gate.menuWillEnd();
    clock += NATIVE_MENU_UNSTAMPED_CANCEL_BEFORE_RELEASE_MS - 1;
    expect(gate.resolvePress({ native: 2300, wall: clock }, press)).toBe("fire");
    // Quick taps (r3: fire 0-1 ms after willEnd) are untouched.
    gate.pressIn({ native: 3000, wall: clock });
    gate.menuConfigure();
    clock += 200;
    gate.menuWillEnd();
    clock += 1;
    expect(gate.resolvePress({ native: 3200, wall: clock }, press)).toBe("fire");
    expect(presses).toBe(2);
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
    // Each stamped on the touch clock (UITouch.timestamp's base).
    expect(swift).toContain("ProcessInfo.processInfo.systemUptime * 1000");
    expect(swift).toContain('onMenuWillDisplay(["uptime": Self.uptimeMs()])');
    expect(swift).toContain('onMenuWillEnd(["uptime": Self.uptimeMs(), "active": active])');
    expect(swift).toContain('onMenuConfigure(["uptime": Self.uptimeMs()])');
    expect(read("modules/nemu-window-layout/src/ContextMenu.native.tsx")).toContain(
      "gate.menuConfigure(nativeContextMenuEventTime(event))",
    );
  });
});

describe("a lift UIKit cancelled under the finger (build 9 r2, item 4)", () => {
  const at = (native: number) => ({ native, wall: 0 });
  function harness() {
    let timers: { run: () => void; handle: number }[] = [];
    let nextHandle = 1;
    const scheduler: NativeContextMenuPressScheduler = {
      set: (run) => {
        const handle = nextHandle++;
        timers.push({ run, handle });
        return handle;
      },
      clear: (handle) => {
        timers = timers.filter((timer) => timer.handle !== handle);
      },
    };
    let presses = 0;
    return {
      gate: createNativeContextMenuPressGate(scheduler),
      press: () => {
        presses += 1;
      },
      presses: () => presses,
      flush: () => {
        const due = timers;
        timers = [];
        for (const timer of due) timer.run();
      },
    };
  }

  test("the clocks: only a lift that ended before the release (touch clock) counts as cancelled while held", () => {
    expect(nativeMenuLiftCancelledWhileHeld(1300, at(1420))).toBe(true);
    expect(nativeMenuLiftCancelledWhileHeld(1420, at(1420))).toBe(false); // the release ended it
    expect(nativeMenuLiftCancelledWhileHeld(1425, at(1420))).toBe(false);
    expect(nativeMenuLiftCancelledWhileHeld(undefined, at(1420))).toBe(false); // older binary
    expect(nativeMenuLiftCancelledWhileHeld(1300, { wall: 5 })).toBe(false);
    expect(nativeMenuLiftCancelledWhileHeld(1300, undefined)).toBe(false);
    expect(nativeContextMenuEventTime({ nativeEvent: { uptime: 12.5 } })).toBe(12.5);
    expect(nativeContextMenuEventTime({ nativeEvent: {} })).toBeUndefined();
    expect(nativeContextMenuEventTime(undefined)).toBeUndefined();
    expect(nativeContextMenuEventActive({ nativeEvent: { active: "UIScrollViewPanGestureRecognizer@RCTEnhancedScrollView" } }))
      .toBe("UIScrollViewPanGestureRecognizer@RCTEnhancedScrollView");
    expect(nativeContextMenuEventActive({ nativeEvent: { active: "" } })).toBe("");
    expect(nativeContextMenuEventActive({ nativeEvent: {} })).toBeUndefined();
  });

  test("420 ms with 13 pt drift: the lift is cancelled at ~300 ms, the release at 420 neither opens nor shows a menu", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(1160);
    gate.menuWillEnd(1300); // the drift (or a scroll view's pan) cancelled the lift
    expect(gate.resolvePress(at(1420), press)).toBe("suppress");
    expect(presses()).toBe(0);
  });

  test("the same when the release reaches JS before the cancel: the deferred press is dropped", () => {
    const { gate, press, presses, flush } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(1160);
    // 320 ms (a 420 ms hold is dropped at once since r3, before any verdict).
    expect(gate.resolvePress(at(1320), press)).toBe("defer");
    gate.menuWillEnd(1300);
    flush();
    expect(presses()).toBe(0);
  });

  test("a quick drag whose lift was cancelled before it lifted is not a tap either (no delay: dropped at once)", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(1150);
    gate.menuWillEnd(1190);
    expect(gate.resolvePress(at(1230), press)).toBe("suppress");
    expect(presses()).toBe(0);
  });

  test("a scroll that starts on a book: the pan cancels the lift and takes the touch — no menu, no press, the next tap is clean", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(1160);
    gate.menuWillEnd(1210, "UIScrollViewPanGestureRecognizer@RCTEnhancedScrollView");
    // The scroll view takes the responder: Pressability never calls onPress.
    gate.pressIn(at(3000));
    expect(gate.resolvePress(at(3090), press)).toBe("fire");
    expect(presses()).toBe(1);
  });

  test("quick taps are untouched: a lift the release itself ended still taps, at once below 250 ms", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    expect(gate.resolvePress(at(1080), press)).toBe("fire");
    gate.pressIn(at(2000));
    gate.menuConfigure(2160);
    expect(gate.resolvePress(at(2240), press)).toBe("fire");
    gate.menuWillEnd(2242);
    expect(presses()).toBe(2);
  });

  test("a 250-500 ms tap whose lift the release ended still presses on the verdict", () => {
    const { gate, press, presses } = harness();
    gate.pressIn(at(1000));
    gate.menuConfigure(1160);
    expect(gate.resolvePress(at(1300), press)).toBe("defer");
    gate.menuWillEnd(1302);
    expect(presses()).toBe(1);
    // Stamped after the release but delivered first: also a tap.
    gate.pressIn(at(2000));
    gate.menuConfigure(2160);
    gate.menuWillEnd(2305);
    expect(gate.resolvePress(at(2300), press)).toBe("fire");
    expect(presses()).toBe(2);
  });
});

describe("a quick swipe on a card is not a tap (build 9 r4 driftQ: 120 ms, 12-14 pt, opened)", () => {
  const at = (native: number, x: number, y: number) => ({ native, wall: 0, x, y });
  const run = () => {
    let presses = 0;
    const press = () => {
      presses += 1;
    };
    return { gate: createNativeContextMenuPressGate(), press, presses: () => presses };
  };

  test("moved past 10 pt before the release (moves seen): dropped, in every direction", () => {
    for (const [dx, dy] of [[12, 0], [-12, 0], [0, 14], [0, -14]]) {
      const { gate, press, presses } = run();
      gate.pressIn(at(1000, 100, 200));
      gate.pressMove(at(1060, 100 + dx / 2, 200 + dy / 2));
      gate.pressMove(at(1100, 100 + dx, 200 + dy));
      expect(gate.resolvePress(at(1120, 100 + dx, 200 + dy), press)).toBe("suppress");
      expect(presses()).toBe(0);
    }
  });

  test("the farthest point counts, even when the finger came back before lifting", () => {
    const { gate, press, presses } = run();
    gate.pressIn(at(1000, 100, 200));
    gate.pressMove(at(1050, 113, 200));
    gate.pressMove(at(1100, 102, 200));
    expect(gate.resolvePress(at(1120, 101, 200), press)).toBe("suppress");
    expect(presses()).toBe(0);
  });

  test("no move events delivered: the release point against the landing point decides", () => {
    const { gate, press, presses } = run();
    gate.pressIn(at(1000, 100, 200));
    expect(gate.resolvePress(at(1120, 100, 213), press)).toBe("suppress");
    expect(presses()).toBe(0);
  });

  test("within the tolerance a quick tap still presses at once at the release (80-240 ms)", () => {
    const { gate, press, presses } = run();
    for (const [index, held] of [80, 160, 240].entries()) {
      const t = 1000 * (index + 1);
      gate.pressIn(at(t, 100, 200));
      gate.pressMove(at(t + held / 2, 100 + NATIVE_MENU_TAP_SLOP_PT * 0.6, 200 + NATIVE_MENU_TAP_SLOP_PT * 0.6));
      expect(gate.resolvePress(at(t + held, 100 + NATIVE_MENU_TAP_SLOP_PT, 200), press)).toBe("fire");
    }
    expect(presses()).toBe(3);
  });

  test("a move measured against the previous touch never leaks into the next one", () => {
    const { gate, press, presses } = run();
    gate.pressIn(at(1000, 100, 200));
    gate.pressMove(at(1050, 140, 200));
    expect(gate.resolvePress(at(1100, 140, 200), press)).toBe("suppress");
    gate.pressIn(at(3000, 300, 200));
    expect(gate.resolvePress(at(3100, 301, 200), press)).toBe("fire");
    expect(presses()).toBe(1);
  });

  test("without positions (older events) nothing changes", () => {
    const { gate, press, presses } = run();
    gate.pressIn({ native: 1000, wall: 0 });
    gate.pressMove({ native: 1050, wall: 0 });
    expect(gate.resolvePress({ native: 1120, wall: 0 }, press)).toBe("fire");
    expect(presses()).toBe(1);
    expect(nativeContextMenuPressTime({ nativeEvent: { timestamp: 5, pageX: 10, pageY: 20 } })).toMatchObject({ native: 5, x: 10, y: 20 });
    expect(nativeContextMenuPressTime({ nativeEvent: { timestamp: 5 } }).x).toBeUndefined();
  });

  test("NemuPressable feeds the gate every move of the touch, only inside a native menu", () => {
    const pressable = read("src/design-system/components/NemuPressable.tsx");
    expect(pressable).toContain("nativeMenuGate.pressMove(nativeContextMenuPressTime(event));");
    expect(pressable).toContain("onTouchMove?.(event);");
    expect(pressable).toContain(": onTouchMove");
  });
});
