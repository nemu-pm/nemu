import { describe, expect, test } from "bun:test";
import {
  formatMobileExploreChapterLabel,
  formatMobileLastRead,
  formatMobileNewChapterCount,
  formatMobileNewChapterTag,
  getMobileExploreNewChapters,
  getMobileNewChapterCount,
  withoutMobileZeroVolume,
} from "./mobileContinueReadingCopy";
import { getMobileStrings } from "./mobileI18n";

const en = getMobileStrings("en");
const now = Date.UTC(2026, 9, 3, 12);

describe("continue-reading copy", () => {
  test("formats the time since the last read in coarse steps", () => {
    expect(formatMobileLastRead(now - 20_000, now, en)).toBe("Just now");
    expect(formatMobileLastRead(now - 5 * 60_000, now, en)).toBe("5 min ago");
    expect(formatMobileLastRead(now - 3 * 3_600_000, now, en)).toBe("3 h ago");
    expect(formatMobileLastRead(now - 50 * 3_600_000, now, en)).toBe("2 d ago");
  });

  test("gives nothing for missing or future times", () => {
    expect(formatMobileLastRead(0, now, en)).toBeNull();
    expect(formatMobileLastRead(now + 10 * 60_000, now, en)).toBeNull();
    expect(formatMobileLastRead(Number.NaN, now, en)).toBeNull();
  });

  test("new means released since the user last looked, never how far behind the reader is", () => {
    const link = (id: string, latest?: number, ack?: number) => ({
      id,
      latestChapter: latest === undefined ? undefined : { id: `l${latest}`, chapterNumber: latest },
      updateAckChapter: ack === undefined ? undefined : { id: `a${ack}`, chapterNumber: ack },
    });
    // Read to Ch.1 of 131, nothing released since the last look: nothing new.
    expect(getMobileExploreNewChapters([link("m", 131, 131)], { sourceId: "m", lastReadNumber: 1 })).toBeNull();
    // Two released since the last look, reader further back: 2, not 130.
    expect(getMobileExploreNewChapters([link("m", 133, 131)], { sourceId: "m", lastReadNumber: 1 })).toEqual({ count: 2 });
    // Read past the acknowledged chapter: counts from the one read.
    expect(getMobileExploreNewChapters([link("m", 133, 129)], { sourceId: "m", lastReadNumber: 132 })).toEqual({ count: 1 });
    // The update is on another source than the one being read.
    expect(getMobileExploreNewChapters([link("a", 10, 10), link("b", 12, 9)], { sourceId: "a", lastReadNumber: 3 })).toEqual({
      count: 3,
    });
    // Read to the newest chapter without acknowledging it: nothing new.
    expect(getMobileExploreNewChapters([link("m", 133, 129)], { sourceId: "m", lastReadNumber: 133 })).toBeNull();
    // No acknowledged chapter: not an update (the library's own rule).
    expect(getMobileExploreNewChapters([link("m", 5)], { sourceId: "m", lastReadNumber: 1 })).toBeNull();
    expect(getMobileExploreNewChapters([{ ...link("m", 9, 3), removed: true }])).toBeNull();
  });

  test("counts newer whole chapters only when both sides are numbered", () => {
    expect(getMobileNewChapterCount(129, 131)).toBe(2);
    expect(getMobileNewChapterCount(130.5, 131)).toBe(1);
    expect(getMobileNewChapterCount(131, 131)).toBeNull();
    expect(getMobileNewChapterCount(undefined, 131)).toBeNull();
    expect(getMobileNewChapterCount(3, undefined)).toBeNull();
  });

  test("caps a large new-chapter count", () => {
    expect(formatMobileNewChapterCount(1)).toBe("1");
    expect(formatMobileNewChapterCount(999)).toBe("999");
    expect(formatMobileNewChapterCount(1000)).toBe("999+");
    expect(formatMobileNewChapterTag(12)).toBe("+12");
    expect(formatMobileNewChapterTag(1199)).toBe("999+");
  });

  test("never shows a volume of 0", () => {
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 0, chapterNumber: 1 }, en)).toBe("Ch.1");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 3, chapterNumber: 12 }, en)).toBe("Vol.3 Ch.12");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 0, title: "Prologue" }, en)).toBe("Prologue");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 0 }, en)).toBeNull();
    const numbered = { id: "a", volumeNumber: 2, chapterNumber: 5 };
    expect(withoutMobileZeroVolume(numbered)).toBe(numbered);
  });
});
