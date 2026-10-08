import { describe, expect, test } from "bun:test";
import {
  formatMobileExploreChapterLabel,
  formatMobileLastRead,
  formatMobileNewChapterCount,
  formatMobileNewChapterTag,
  getMobileExploreNewChapters,
  withoutMobileZeroVolume,
} from "./mobileContinueReadingCopy";
import { getMobileStrings } from "./mobileI18n";

const en = getMobileStrings("en");
const now = Date.UTC(2026, 9, 3, 12);

describe("continue-reading copy", () => {
  test("the last read is shown in coarse steps; missing or future times show nothing", () => {
    expect(formatMobileLastRead(now - 20_000, now, en)).toBe("Just now");
    expect(formatMobileLastRead(now - 5 * 60_000, now, en)).toBe("5 min ago");
    expect(formatMobileLastRead(now - 50 * 3_600_000, now, en)).toBe("2 d ago");
    expect(formatMobileLastRead(0, now, en)).toBeNull();
    expect(formatMobileLastRead(now + 10 * 60_000, now, en)).toBeNull();
  });

  test("new means released since the user last looked, never how far behind the reader is", () => {
    const link = (id: string, latest?: number, ack?: number) => ({
      id,
      latestChapter: latest === undefined ? undefined : { id: `l${latest}`, chapterNumber: latest },
      updateAckChapter: ack === undefined ? undefined : { id: `a${ack}`, chapterNumber: ack },
    });
    // Nothing released since the last look.
    expect(getMobileExploreNewChapters([link("m", 131, 131)], { sourceId: "m", lastReadNumber: 1 })).toBeNull();
    // Two released since the last look, reader far back: 2, not 130.
    expect(getMobileExploreNewChapters([link("m", 133, 131)], { sourceId: "m", lastReadNumber: 1 })).toEqual({ count: 2 });
    // Read past the acknowledged chapter: counts from the one read.
    expect(getMobileExploreNewChapters([link("m", 133, 129)], { sourceId: "m", lastReadNumber: 132 })).toEqual({ count: 1 });
    // No acknowledged chapter, or a removed link: not an update.
    expect(getMobileExploreNewChapters([link("m", 5)], { sourceId: "m", lastReadNumber: 1 })).toBeNull();
    expect(getMobileExploreNewChapters([{ ...link("m", 9, 3), removed: true }])).toBeNull();
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
