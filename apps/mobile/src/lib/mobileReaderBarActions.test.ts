import { describe, expect, test } from "bun:test";
import { mobileReaderBarActionIds, mobileReaderBarActionStates, splitMobileReaderBarActions } from "./mobileReaderBarActions";
import { getMobileStrings } from "./mobileI18n";
import { buildMobileReaderOverflowItems } from "./mobileReaderMoreMenu";
import {
  mobileReaderBottomRowActionsRoom,
  mobileReaderCapsuleActionSlots,
  mobileReaderCapsuleActionsWidth,
  mobileReaderVerticalBarVisibleActionCount,
  mobileReaderVisibleActionCount,
  READER_BAR_MAX_ACTIONS,
  READER_CAPSULE_EDGE,
  READER_CAPSULE_GAP,
  READER_SCRUBBER_CHROME_WIDTH,
  READER_SLIDER_MIN_TRACK_WIDTH,
} from "./mobileReaderPoseLayout";

const all = mobileReaderBarActionIds({
  enabledPluginIds: ["japanese-learning", "dual-reader"],
  bilingualToggle: true,
});
const phoneRoom = (width: number) => width - 2 * READER_CAPSULE_EDGE;

describe("reader bar action states", () => {
  const idle = { ocrStatus: "idle", chatMessageCount: 0, chatStreaming: false, dualReadEnabled: false } as const;

  test("Detect text is on from the moment the page has a detection, whatever its outcome", () => {
    expect(mobileReaderBarActionStates(idle).detectTextActive).toBe(false);
    for (const ocrStatus of ["loading", "ready", "error"] as const) {
      expect(mobileReaderBarActionStates({ ...idle, ocrStatus }).detectTextActive).toBe(true);
    }
  });

  test("Nemu Chat is on with a conversation or a reply on its way", () => {
    expect(mobileReaderBarActionStates(idle).nemuChatActive).toBe(false);
    expect(mobileReaderBarActionStates({ ...idle, chatMessageCount: 2 }).nemuChatActive).toBe(true);
    expect(mobileReaderBarActionStates({ ...idle, chatStreaming: true }).nemuChatActive).toBe(true);
  });

  test("the states are independent of each other", () => {
    const states = mobileReaderBarActionStates({ ...idle, ocrStatus: "ready" });
    expect(states).toEqual({ detectTextActive: true, nemuChatActive: false, dualReadEnabled: false });
    expect(mobileReaderBarActionStates({ ...idle, dualReadEnabled: true }).dualReadEnabled).toBe(true);
  });

  test("the ⋯ menu's checkmarks are the bar's states in every combination", () => {
    const strings = getMobileStrings("en");
    for (const ocrStatus of ["idle", "loading", "ready", "error"] as const) {
      for (const chatMessageCount of [0, 1]) {
        for (const dualReadEnabled of [false, true]) {
          const states = mobileReaderBarActionStates({ ocrStatus, chatMessageCount, chatStreaming: false, dualReadEnabled });
          const items = buildMobileReaderOverflowItems(
            ["detect-text", "nemu-chat", "plugin:dual-reader"],
            { ...states, dualReadAvailable: true, bilingualLayoutValue: "" },
            strings,
          );
          expect(items.map((item) => item.checked)).toEqual([
            states.detectTextActive,
            states.nemuChatActive,
            states.dualReadEnabled,
          ]);
        }
      }
    }
  });
});

describe("reader bar actions", () => {
  test("ids follow the capsule's order and its slot count", () => {
    expect(all).toEqual([
      "detect-text",
      "nemu-chat",
      "plugin:dual-reader",
      "bilingual-layout",
      "chapter-list",
      "settings",
    ]);
    expect(all.length).toBe(
      mobileReaderCapsuleActionSlots({ enabledPluginIds: ["japanese-learning", "dual-reader"], bilingualToggle: true }),
    );
    expect(mobileReaderBarActionIds({ enabledPluginIds: [], bilingualToggle: false })).toEqual([
      "chapter-list",
      "settings",
    ]);
  });

  test("the gear stays, then Chapters, then the rest as drawn; both lists keep the drawn order", () => {
    expect(splitMobileReaderBarActions(all, 1)).toEqual({
      visible: ["settings"],
      overflow: ["detect-text", "nemu-chat", "plugin:dual-reader", "bilingual-layout", "chapter-list"],
    });
    expect(splitMobileReaderBarActions(all, 2).visible).toEqual(["chapter-list", "settings"]);
    expect(splitMobileReaderBarActions(all, 3).visible).toEqual(["detect-text", "chapter-list", "settings"]);
    expect(splitMobileReaderBarActions(all, 4)).toEqual({
      visible: ["detect-text", "nemu-chat", "chapter-list", "settings"],
      overflow: ["plugin:dual-reader", "bilingual-layout"],
    });
    expect(splitMobileReaderBarActions(all, 6)).toEqual({ visible: all, overflow: [] });
  });

  test("the gear survives any count, and nothing is lost or doubled", () => {
    expect(splitMobileReaderBarActions(all, 0).visible).toEqual(["settings"]);
    for (let count = 0; count <= 7; count += 1) {
      const { visible, overflow } = splitMobileReaderBarActions(all, count);
      expect(visible.length + overflow.length).toBe(all.length);
      expect(new Set([...visible, ...overflow]).size).toBe(all.length);
    }
  });

  test("never more than the cap, however wide the row", () => {
    expect(READER_BAR_MAX_ACTIONS).toBe(4);
    expect(mobileReaderVisibleActionCount(6, 5000)).toBe(4);
    expect(mobileReaderVisibleActionCount(5, 5000)).toBe(4);
    expect(mobileReaderVisibleActionCount(3, 5000)).toBe(3);
  });

  test("what each iPhone portrait width keeps with all six actions", () => {
    const counts = [375, 390, 393, 402, 414, 428, 430, 440].map((width) => mobileReaderVisibleActionCount(6, phoneRoom(width)));
    expect(counts).toEqual([1, 2, 2, 2, 2, 2, 2, 3]);
  });

  test("the slider keeps its minimum track wherever the room allows more than the gear", () => {
    for (let room = 150; room < 900; room += 1) {
      const count = mobileReaderVisibleActionCount(6, room);
      if (count === 1) continue;
      const track = room - mobileReaderCapsuleActionsWidth(count) - READER_CAPSULE_GAP - READER_SCRUBBER_CHROME_WIDTH;
      expect(track).toBeGreaterThanOrEqual(READER_SLIDER_MIN_TRACK_WIDTH);
    }
  });

  test("the count only grows with room: resizing never bounces an action", () => {
    let previous = 1;
    for (let room = 100; room < 900; room += 1) {
      const count = mobileReaderVisibleActionCount(6, room);
      expect(count).toBeGreaterThanOrEqual(previous);
      previous = count;
    }
  });

  test("the room is the region less its margins, safe areas counted", () => {
    expect(mobileReaderBottomRowActionsRoom(402, { left: 0, right: 0 })).toBe(362);
    expect(mobileReaderBottomRowActionsRoom(874, { left: 62, right: 62 })).toBe(750);
  });

  test("system vertical bar: only height limits it, and ⋯ takes a slot of the pill", () => {
    // The Duo outer display holds all six, more than the bottom row's cap.
    expect(mobileReaderVerticalBarVisibleActionCount(6, { height: 678, bottomInset: 20, coverToggle: true })).toBe(6);
    // Without the toggle the pill starts a slot higher.
    const short = { height: 500, bottomInset: 20 };
    expect(mobileReaderVerticalBarVisibleActionCount(6, { ...short, coverToggle: true })).toBe(2);
    expect(mobileReaderVerticalBarVisibleActionCount(6, { ...short, coverToggle: false })).toBe(3);
    expect(mobileReaderVerticalBarVisibleActionCount(2, { ...short, coverToggle: true })).toBe(2);
    // The gear stays however short the window.
    expect(mobileReaderVerticalBarVisibleActionCount(6, { height: 200, bottomInset: 0, coverToggle: true })).toBe(1);
  });
});
