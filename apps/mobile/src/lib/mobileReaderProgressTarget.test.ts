import { describe, expect, test } from "bun:test";
import { makeChapterProgressId } from "@/data/schema";
import {
  buildMobileReaderProgressRecords,
  shouldApplyMobileReaderProgressToScreen,
  type MobileReaderProgressTarget,
} from "./mobileReaderProgressTarget";

const sourceRef = { registryId: "aidoku", sourceId: "jumpplus", sourceMangaId: "spy" };
const identity = `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;

const leaving: MobileReaderProgressTarget = {
  chapterId: "ch-140",
  chapter: { chapterNumber: 140, title: "Mission 140" },
  pageCount: 22,
  savedProgress: { completed: false, updatedAt: 10 },
};
const arriving: MobileReaderProgressTarget = {
  chapterId: "ch-141",
  chapter: { chapterNumber: 141 },
  pageCount: 19,
  savedProgress: null,
};

describe("buildMobileReaderProgressRecords", () => {
  test("a completion for the chapter just left is written under that chapter", () => {
    const { chapterProgress, mangaProgress } = buildMobileReaderProgressRecords({
      target: leaving,
      sourceRef,
      libraryItemId: "lib-1",
      complete: true,
      displayIndex: 3,
      mode: "scrolling",
      updatedAt: 1000,
    });
    expect(chapterProgress.id).toBe(
      makeChapterProgressId("aidoku", "jumpplus", "spy", "ch-140"),
    );
    expect(chapterProgress.sourceChapterId).toBe("ch-140");
    expect(chapterProgress.completed).toBe(true);
    expect(chapterProgress.progress).toBe(21);
    expect(chapterProgress.total).toBe(22);
    expect(chapterProgress.chapterNumber).toBe(140);
    expect(chapterProgress.chapterTitle).toBe("Mission 140");
    expect(chapterProgress.lastReadAt).toBe(1000);
    expect(chapterProgress.updatedAt).toBe(1000);
    expect(mangaProgress.lastReadSourceChapterId).toBe("ch-140");
    expect(mangaProgress.lastReadChapterNumber).toBe(140);
  });

  test("the arriving chapter's position uses its own page count, not the one left", () => {
    const { chapterProgress, mangaProgress } = buildMobileReaderProgressRecords({
      target: arriving,
      sourceRef,
      complete: false,
      displayIndex: 40,
      mode: "scrolling",
      updatedAt: 2000,
    });
    expect(chapterProgress.sourceChapterId).toBe("ch-141");
    expect(chapterProgress.progress).toBe(18);
    expect(chapterProgress.total).toBe(19);
    expect(chapterProgress.completed).toBe(false);
    expect(mangaProgress.lastReadSourceChapterId).toBe("ch-141");
  });

  test("completion is never inferred from the position, but a recorded one stays", () => {
    const atEnd = buildMobileReaderProgressRecords({
      target: arriving,
      sourceRef,
      complete: false,
      displayIndex: 18,
      mode: "scrolling",
      updatedAt: 1,
    });
    expect(atEnd.chapterProgress.completed).toBe(false);
    const reread = buildMobileReaderProgressRecords({
      target: { ...leaving, savedProgress: { completed: true, updatedAt: 1 } },
      sourceRef,
      complete: false,
      displayIndex: 0,
      mode: "scrolling",
      updatedAt: 2,
    });
    expect(reread.chapterProgress.completed).toBe(true);
    expect(reread.chapterProgress.progress).toBe(0);
  });

  test("intra-page state: the write's own, else the target's saved one — never another chapter's", () => {
    const explicit = buildMobileReaderProgressRecords({
      target: leaving,
      sourceRef,
      complete: false,
      displayIndex: 0,
      mode: "scrolling",
      updatedAt: 1,
      intraPageProgress: 0.5,
      intraPageContentIdentity: identity,
    });
    expect(explicit.chapterProgress.intraPageProgress).toBe(0.5);
    const carried = buildMobileReaderProgressRecords({
      target: {
        ...leaving,
        savedProgress: {
          completed: false,
          updatedAt: 1,
          intraPageProgress: 0.25,
          intraPageContentIdentity: identity,
        },
      },
      sourceRef,
      complete: false,
      displayIndex: 0,
      mode: "scrolling",
      updatedAt: 1,
    });
    expect(carried.chapterProgress.intraPageProgress).toBe(0.25);
    const none = buildMobileReaderProgressRecords({
      target: arriving,
      sourceRef,
      complete: false,
      displayIndex: 0,
      mode: "scrolling",
      updatedAt: 1,
    });
    expect(none.chapterProgress.intraPageProgress).toBeUndefined();
  });

  test("paged modes keep the source-order index", () => {
    const { chapterProgress } = buildMobileReaderProgressRecords({
      target: leaving,
      sourceRef,
      complete: false,
      displayIndex: 5,
      mode: "rtl",
      updatedAt: 1,
    });
    expect(chapterProgress.progress).toBe(5);
  });
});

describe("shouldApplyMobileReaderProgressToScreen", () => {
  test("only a write for the chapter on screen refreshes the screen", () => {
    expect(shouldApplyMobileReaderProgressToScreen("ch-141", "ch-141", undefined)).toBe(true);
    expect(shouldApplyMobileReaderProgressToScreen("ch-140", "ch-141", undefined)).toBe(false);
    expect(shouldApplyMobileReaderProgressToScreen("ch-141", "ch-141", false)).toBe(false);
  });
});
