/**
 * The reader stage's raw touch handlers turn single-finger taps into page
 * turns and the chrome toggle. A touch sequence (first finger down to last
 * finger up) that ever holds two fingers belongs to the two-finger gestures
 * (pinch, the two-finger double tap for 错开一页), so none of its touches
 * may count as a tap.
 */

type StageTouch = { identifier: number | string };
export type ReaderStageTouchEvent = {
  /** Fingers on the surface (RN may or may not still list the ones lifting). */
  touches: readonly StageTouch[];
  /** The fingers this event is about. */
  changedTouches: readonly StageTouch[];
};

export function readerStageFingersDown(event: ReaderStageTouchEvent): number {
  const ids = new Set(event.touches.map((touch) => touch.identifier));
  for (const touch of event.changedTouches) ids.add(touch.identifier);
  return ids.size;
}

export function readerStageFingersLeft(event: ReaderStageTouchEvent): number {
  const lifting = new Set(event.changedTouches.map((touch) => touch.identifier));
  return event.touches.filter((touch) => !lifting.has(touch.identifier)).length;
}

/** Touch down: the sequence is multi-touch from the moment a second finger lands. */
export function readerStageMultiTouchOnStart(multiTouch: boolean, event: ReaderStageTouchEvent): boolean {
  return multiTouch || readerStageFingersDown(event) >= 2;
}

/**
 * Touch up: whether this lift is part of a multi-touch sequence (never a
 * tap), and whether the sequence goes on (another finger is still down).
 */
export function readerStageMultiTouchOnEnd(
  multiTouch: boolean,
  event: ReaderStageTouchEvent,
): { ignore: boolean; multiTouch: boolean } {
  const ignore = multiTouch || readerStageFingersDown(event) >= 2;
  return { ignore, multiTouch: ignore && readerStageFingersLeft(event) > 0 };
}
