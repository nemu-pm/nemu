/**
 * Tap turns that land while a tap-started chapter crossing is still in
 * flight (the pager is gliding into the next chapter's frame, or it has
 * settled there but the reader has not re-rendered as that chapter yet).
 *
 * In that window the reader still reads the chapter it is leaving: a step
 * computed from it targets the very frame the crossing is already heading
 * to, so the tap turned nothing (a "dropped" tap). Such taps are queued
 * instead and replayed one at a time once the crossing has landed.
 */
export type ReaderCrossingTapDirection = "previous" | "next";

/** A crossing that never lands (interrupted, refused) stops holding taps. */
export const READER_CROSSING_TAP_HOLD_MAX_MS = 1500;
/** A queued tap this old is no longer what the reader meant: dropped. */
export const READER_CROSSING_TAP_STALE_MS = 2500;
/** Taps beyond this many are a held finger, not intent: not queued. */
export const READER_CROSSING_TAP_QUEUE_MAX = 6;

export type ReaderCrossingTapQueue = {
  /** A tap turn started a crossing out of `fromChapterId`. */
  beginCrossing(fromChapterId: string, now: number): void;
  /** The crossing ended without landing (refused, rested back). */
  cancelCrossing(): void;
  /**
   * A tap turn arrived. True: it is held for the crossing in flight (the
   * caller turns nothing now).
   */
  hold(direction: ReaderCrossingTapDirection, openChapterId: string, now: number): boolean;
  /**
   * The reader rendered (as `openChapterId`, not mid-turn): the next tap to
   * replay, if the crossing has landed and one is waiting.
   */
  next(openChapterId: string, now: number): ReaderCrossingTapDirection | null;
  readonly pending: number;
};

export function createReaderCrossingTapQueue(): ReaderCrossingTapQueue {
  let crossing: { fromChapterId: string; startedAt: number } | null = null;
  let queued: { direction: ReaderCrossingTapDirection; at: number }[] = [];
  const inFlight = (openChapterId: string, now: number) => {
    if (!crossing) return false;
    if (crossing.fromChapterId !== openChapterId) {
      // Landed: the reader is the arriving chapter now.
      crossing = null;
      return false;
    }
    if (now - crossing.startedAt > READER_CROSSING_TAP_HOLD_MAX_MS) {
      crossing = null;
      return false;
    }
    return true;
  };
  return {
    beginCrossing(fromChapterId, now) {
      crossing = { fromChapterId, startedAt: now };
    },
    cancelCrossing() {
      crossing = null;
    },
    hold(direction, openChapterId, now) {
      // Replays still waiting go first: a fresh tap queues behind them.
      queued = queued.filter((entry) => now - entry.at <= READER_CROSSING_TAP_STALE_MS);
      if (!inFlight(openChapterId, now) && queued.length === 0) return false;
      if (queued.length < READER_CROSSING_TAP_QUEUE_MAX) queued.push({ direction, at: now });
      return true;
    },
    next(openChapterId, now) {
      if (inFlight(openChapterId, now)) return null;
      queued = queued.filter((entry) => now - entry.at <= READER_CROSSING_TAP_STALE_MS);
      return queued.shift()?.direction ?? null;
    },
    get pending() {
      return queued.length;
    },
  };
}
