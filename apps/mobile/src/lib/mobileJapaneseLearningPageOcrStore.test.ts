import { expect, test } from "bun:test";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type {
  MobileJapaneseLearningOcrOptions,
  MobileJapaneseLearningOcrResult,
} from "./mobileJapaneseLearningOcr";
import {
  MobileJapaneseLearningPageImageUnavailableError,
  createMobileJapaneseLearningPageOcrStore,
  mobileJapaneseLearningPageOcrKey,
} from "./mobileJapaneseLearningPageOcrStore";

const page = (id: string): MobileReaderPage => ({
  id,
  index: 0,
  imageUri: `file:///${id}.jpg`,
  imageUriOwnership: "app",
});
const result = (text: string): MobileJapaneseLearningOcrResult => ({
  source: "ocr",
  text,
  detections: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A recognizer whose runs finish only when the test says so. */
function manualRecognizer() {
  const runs: Array<{
    page: MobileReaderPage;
    options: MobileJapaneseLearningOcrOptions;
    done: ReturnType<typeof deferred<MobileJapaneseLearningOcrResult>>;
  }> = [];
  const recognize = (page: MobileReaderPage, options: MobileJapaneseLearningOcrOptions) => {
    const done = deferred<MobileJapaneseLearningOcrResult>();
    runs.push({ page, options, done });
    options.signal?.addEventListener("abort", () => done.reject(options.signal!.reason), {
      once: true,
    });
    return done.promise;
  };
  return { runs, recognize };
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

test("caches a page's result and reuses it without another run", async () => {
  const { runs, recognize } = manualRecognizer();
  const store = createMobileJapaneseLearningPageOcrStore({ recognize });
  const first = store.recognize({ key: "p1", page: page("p1") });
  await flush();
  expect(runs).toHaveLength(1);
  runs[0]!.done.resolve(result("こんにちは"));
  expect((await first).text).toBe("こんにちは");
  expect(store.peek("p1")?.text).toBe("こんにちは");
  expect((await store.recognize({ key: "p1", page: page("p1") })).text).toBe("こんにちは");
  expect(runs).toHaveLength(1);
  expect(store.version()).toBe(1);
});

test("joins a second caller to the page's run instead of recognizing twice", async () => {
  const { runs, recognize } = manualRecognizer();
  const store = createMobileJapaneseLearningPageOcrStore({ recognize });
  const chat = store.recognize({ key: "p1", page: page("p1"), priority: "chat" });
  const reader = store.recognize({ key: "p1", page: page("p1"), priority: "reader" });
  await flush();
  expect(runs).toHaveLength(1);
  expect(store.isRecognizing("p1")).toBe(true);
  runs[0]!.done.resolve(result("a"));
  expect((await chat).text).toBe("a");
  expect((await reader).text).toBe("a");
  expect(store.isRecognizing("p1")).toBe(false);
});

test("recognizes one page at a time and lets the reader jump Nemu's queue", async () => {
  const { runs, recognize } = manualRecognizer();
  const store = createMobileJapaneseLearningPageOcrStore({
    recognize,
    preparedPageLimit: 8,
  });
  const loader = (id: string) => async () => page(id);
  const c1 = store.recognize({ key: "c1", page: loader("c1"), priority: "chat" });
  const c2 = store.recognize({ key: "c2", page: loader("c2"), priority: "chat" });
  const c3 = store.recognize({ key: "c3", page: loader("c3"), priority: "chat" });
  await flush();
  expect(runs.map((run) => run.page.id)).toEqual(["c1"]);
  expect(store.recognizing).toBe(1);
  const r = store.recognize({ key: "r", page: page("r"), priority: "reader" });
  await flush();
  runs[0]!.done.resolve(result("1"));
  await flush();
  // The reader's page runs before Nemu's remaining pages.
  expect(runs.map((run) => run.page.id)).toEqual(["c1", "r"]);
  runs[1]!.done.resolve(result("r"));
  await flush();
  expect(runs.map((run) => run.page.id)).toEqual(["c1", "r", "c2"]);
  runs[2]!.done.resolve(result("2"));
  await flush();
  runs[3]!.done.resolve(result("3"));
  expect((await Promise.all([c1, c2, c3, r])).map((item) => item.text)).toEqual([
    "1",
    "2",
    "3",
    "r",
  ]);
});

test("holds at most the prepared-page limit of Nemu's images at once", async () => {
  const { runs, recognize } = manualRecognizer();
  const store = createMobileJapaneseLearningPageOcrStore({
    recognize,
    preparedPageLimit: 2,
  });
  const loaded: string[] = [];
  const loader = (id: string) => async () => {
    loaded.push(id);
    return page(id);
  };
  const all = ["a", "b", "c", "d"].map((id) =>
    store.recognize({ key: id, page: loader(id), priority: "chat" }),
  );
  await flush();
  // Two loaded (one recognizing, one ready); the rest wait to load.
  expect(loaded).toEqual(["a", "b"]);
  expect(runs).toHaveLength(1);
  runs[0]!.done.resolve(result("a"));
  await flush();
  expect(loaded).toEqual(["a", "b", "c"]);
  for (let index = 1; index < 4; index += 1) {
    await flush();
    runs[index]!.done.resolve(result(String(index)));
  }
  await Promise.all(all);
  expect(loaded).toEqual(["a", "b", "c", "d"]);
});

test("cancels a queued page when its only caller aborts, before it ever runs", async () => {
  const { runs, recognize } = manualRecognizer();
  const store = createMobileJapaneseLearningPageOcrStore({ recognize });
  const busy = store.recognize({ key: "busy", page: page("busy"), priority: "chat" });
  const controller = new AbortController();
  const queued = store.recognize({
    key: "queued",
    page: page("queued"),
    priority: "chat",
    signal: controller.signal,
  });
  await flush();
  controller.abort(new Error("chat closed"));
  await expect(queued).rejects.toThrow("chat closed");
  expect(store.isRecognizing("queued")).toBe(false);
  runs[0]!.done.resolve(result("busy"));
  await busy;
  await flush();
  expect(runs.map((run) => run.page.id)).toEqual(["busy"]);
  expect(store.peek("queued")).toBeUndefined();
});

test("keeps a shared run alive until every waiting caller has gone", async () => {
  const { runs, recognize } = manualRecognizer();
  const store = createMobileJapaneseLearningPageOcrStore({ recognize });
  const chat = new AbortController();
  const reader = new AbortController();
  const fromChat = store.recognize({ key: "p", page: page("p"), signal: chat.signal });
  const fromReader = store.recognize({ key: "p", page: page("p"), signal: reader.signal });
  await flush();
  chat.abort(new Error("chat gone"));
  await expect(fromChat).rejects.toThrow("chat gone");
  expect(runs[0]!.options.signal!.aborted).toBe(false);
  runs[0]!.done.resolve(result("still here"));
  expect((await fromReader).text).toBe("still here");

  const last = new AbortController();
  const lone = store.recognize({ key: "q", page: page("q"), signal: last.signal });
  await flush();
  last.abort(new Error("reader left"));
  await expect(lone).rejects.toThrow("reader left");
  expect(runs[1]!.options.signal!.aborted).toBe(true);
});

test("reports a page without an image and never caches failures", async () => {
  let calls = 0;
  const store = createMobileJapaneseLearningPageOcrStore({
    recognize: async () => {
      calls += 1;
      throw new Error("engine failed");
    },
  });
  await expect(
    store.recognize({ key: "none", page: async () => null, priority: "chat" }),
  ).rejects.toBeInstanceOf(MobileJapaneseLearningPageImageUnavailableError);
  await expect(store.recognize({ key: "p", page: page("p") })).rejects.toThrow("engine failed");
  await expect(store.recognize({ key: "p", page: page("p") })).rejects.toThrow("engine failed");
  expect(calls).toBe(2);
  expect(store.peek("p")).toBeUndefined();
});

test("evicts the least recently used page past the limit and notifies subscribers", async () => {
  const store = createMobileJapaneseLearningPageOcrStore({
    recognize: async (item) => result(item.id),
    limit: 2,
  });
  let notified = 0;
  const unsubscribe = store.subscribe(() => {
    notified += 1;
  });
  await store.recognize({ key: "a", page: page("a") });
  await store.recognize({ key: "b", page: page("b") });
  store.peek("a");
  await store.recognize({ key: "c", page: page("c") });
  expect(store.peek("a")?.text).toBe("a");
  expect(store.peek("b")).toBeUndefined();
  expect(store.peek("c")?.text).toBe("c");
  expect(notified).toBe(3);
  unsubscribe();
});

test("keys a page by chapter, page id and engine, not by its image URL", () => {
  const ref = {
    registryId: "aidoku",
    sourceId: "ja.nicomanga",
    mangaId: "m",
    chapterId: "c",
    pageId: "3:https://x/3.jpg",
  };
  expect(mobileJapaneseLearningPageOcrKey(ref, "on-device")).toBe(
    mobileJapaneseLearningPageOcrKey({ ...ref }, "on-device"),
  );
  expect(mobileJapaneseLearningPageOcrKey(ref, "on-device")).not.toBe(
    mobileJapaneseLearningPageOcrKey(ref, "cloud"),
  );
  expect(mobileJapaneseLearningPageOcrKey(ref, "on-device")).not.toBe(
    mobileJapaneseLearningPageOcrKey({ ...ref, chapterId: "d" }, "on-device"),
  );
});
