import { describe, expect, test } from "bun:test";

import { MOBILE_READER_STRIP_PREPEND_MODE } from "./mobileReaderChapterStrip";
import {
  MOBILE_READER_STRIP_PULL_IDLE,
  MOBILE_READER_STRIP_PULL_THRESHOLD,
  mobileReaderStripPullHeaderOpacity,
  mobileReaderStripPullReleases,
  nextMobileReaderStripPull,
  type MobileReaderStripPullState,
} from "./mobileReaderStripPull";

/** Feeds a drag's offsets; returns the final state and the haptics fired. */
function drag(offsets: number[], options: { enabled?: boolean; from?: MobileReaderStripPullState } = {}) {
  let state = options.from ?? MOBILE_READER_STRIP_PULL_IDLE;
  let haptics = 0;
  for (const offset of offsets) {
    const next = nextMobileReaderStripPull(state, { offset, dragging: true, enabled: options.enabled ?? true });
    state = next.state;
    if (next.haptic) haptics += 1;
  }
  return { state, haptics };
}

describe("seamless scroll: pull to load the previous chapter", () => {
  test("defaults: auto mode, 72pt threshold", () => {
    expect(MOBILE_READER_STRIP_PREPEND_MODE).toBe("auto");
    expect(MOBILE_READER_STRIP_PULL_THRESHOLD).toBe(72);
  });

  test("a pull past 72pt arms once (one haptic) and releases the fetch", () => {
    const { state, haptics } = drag([0, -20, -50, -71.5, -72, -90, -120]);
    expect(state).toEqual({ pull: 120, armed: true });
    expect(haptics).toBe(1);
    expect(mobileReaderStripPullReleases(state)).toBe(true);
  });

  test("short of the threshold: a plain bounce, nothing fetched", () => {
    const { state, haptics } = drag([0, -30, -71.9]);
    expect(state.armed).toBe(false);
    expect(haptics).toBe(0);
    expect(mobileReaderStripPullReleases(state)).toBe(false);
  });

  test("dropping back under the threshold disarms; coming back re-arms with a second haptic", () => {
    const back = drag([-80, -60]);
    expect(back.state.armed).toBe(false);
    expect(back.haptics).toBe(1);
    expect(mobileReaderStripPullReleases(back.state)).toBe(false);
    const again = drag([-75], { from: back.state });
    expect(again.state.armed).toBe(true);
    expect(again.haptics).toBe(1);
  });

  test("only a finger arms: the bounce back after letting go never re-arms or ticks", () => {
    const armed = drag([-100]).state;
    const bounce = nextMobileReaderStripPull(armed, { offset: -90, dragging: false, enabled: true });
    expect(bounce).toEqual({ state: { pull: 90, armed: false }, haptic: false });
    const fromIdle = nextMobileReaderStripPull(MOBILE_READER_STRIP_PULL_IDLE, { offset: -100, dragging: false, enabled: true });
    expect(fromIdle.state.armed).toBe(false);
    expect(fromIdle.haptic).toBe(false);
  });

  test("disabled (auto mode, not at the head, no chapter above): idle whatever the offset", () => {
    const { state, haptics } = drag([-200], { enabled: false });
    expect(state).toBe(MOBILE_READER_STRIP_PULL_IDLE);
    expect(haptics).toBe(0);
    expect(nextMobileReaderStripPull(drag([-100]).state, { offset: -100, dragging: true, enabled: false }).state).toBe(
      MOBILE_READER_STRIP_PULL_IDLE,
    );
  });

  test("scrolled down (positive offsets) is no pull; an unchanged event keeps the same state object", () => {
    const { state } = drag([0, 200, 4_000]);
    expect(state.pull).toBe(0);
    expect(state.armed).toBe(false);
    const same = nextMobileReaderStripPull(state, { offset: 5_000, dragging: true, enabled: true });
    expect(same.state).toBe(state);
    expect(nextMobileReaderStripPull(state, { offset: Number.NaN, dragging: true, enabled: true }).state).toBe(
      MOBILE_READER_STRIP_PULL_IDLE,
    );
  });

  test("the header fades in over the threshold", () => {
    expect(mobileReaderStripPullHeaderOpacity(0)).toBe(0);
    expect(mobileReaderStripPullHeaderOpacity(36)).toBeCloseTo(0.5, 6);
    expect(mobileReaderStripPullHeaderOpacity(72)).toBe(1);
    expect(mobileReaderStripPullHeaderOpacity(200)).toBe(1);
    expect(mobileReaderStripPullHeaderOpacity(-5)).toBe(0);
  });
});
