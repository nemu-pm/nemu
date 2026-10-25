import { describe, expect, test } from "bun:test";
import {
  createReaderCrossingTapQueue,
  READER_CROSSING_TAP_HOLD_MAX_MS,
  READER_CROSSING_TAP_QUEUE_MAX,
  READER_CROSSING_TAP_STALE_MS,
} from "./readerCrossingTapQueue";

describe("reader crossing tap queue", () => {
  test("no crossing: taps are not held", () => {
    const queue = createReaderCrossingTapQueue();
    expect(queue.hold("next", "ch17", 0)).toBe(false);
    expect(queue.next("ch17", 0)).toBeNull();
  });

  test("a tap during a crossing is held, then replayed once it lands", () => {
    const queue = createReaderCrossingTapQueue();
    queue.beginCrossing("ch17", 0);
    expect(queue.hold("next", "ch17", 350)).toBe(true);
    // Still the chapter left (settled, not re-rendered): nothing yet.
    expect(queue.next("ch17", 400)).toBeNull();
    expect(queue.next("ch18", 450)).toBe("next");
    expect(queue.next("ch18", 460)).toBeNull();
  });

  test("rapid taps replay in order, one per call", () => {
    const queue = createReaderCrossingTapQueue();
    queue.beginCrossing("ch17", 0);
    queue.hold("next", "ch17", 100);
    queue.hold("next", "ch17", 200);
    queue.hold("previous", "ch17", 300);
    expect(queue.next("ch18", 400)).toBe("next");
    expect(queue.next("ch18", 401)).toBe("next");
    expect(queue.next("ch18", 402)).toBe("previous");
    expect(queue.pending).toBe(0);
  });

  test("a fresh tap after landing queues behind replays still waiting", () => {
    const queue = createReaderCrossingTapQueue();
    queue.beginCrossing("ch17", 0);
    queue.hold("next", "ch17", 100);
    queue.hold("next", "ch17", 200);
    expect(queue.next("ch18", 300)).toBe("next");
    expect(queue.hold("previous", "ch18", 310)).toBe(true);
    expect(queue.next("ch18", 320)).toBe("next");
    expect(queue.next("ch18", 330)).toBe("previous");
    expect(queue.hold("next", "ch18", 340)).toBe(false);
  });

  test("a crossing that never lands stops holding taps", () => {
    const queue = createReaderCrossingTapQueue();
    queue.beginCrossing("ch17", 0);
    queue.hold("next", "ch17", 100);
    expect(queue.next("ch17", READER_CROSSING_TAP_HOLD_MAX_MS - 1)).toBeNull();
    expect(queue.next("ch17", READER_CROSSING_TAP_HOLD_MAX_MS + 1)).toBe("next");
    expect(queue.hold("next", "ch17", READER_CROSSING_TAP_HOLD_MAX_MS + 2)).toBe(false);
  });

  test("a cancelled crossing releases held taps", () => {
    const queue = createReaderCrossingTapQueue();
    queue.beginCrossing("ch17", 0);
    queue.hold("next", "ch17", 100);
    queue.cancelCrossing();
    expect(queue.next("ch17", 120)).toBe("next");
  });

  test("stale taps are dropped and the queue is bounded", () => {
    const queue = createReaderCrossingTapQueue();
    queue.beginCrossing("ch17", 0);
    for (let i = 0; i < READER_CROSSING_TAP_QUEUE_MAX + 3; i += 1) queue.hold("next", "ch17", 10);
    expect(queue.pending).toBe(READER_CROSSING_TAP_QUEUE_MAX);
    expect(queue.next("ch18", 10 + READER_CROSSING_TAP_STALE_MS + 1)).toBeNull();
    expect(queue.pending).toBe(0);
  });
});
