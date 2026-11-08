import { describe, expect, test } from "bun:test";
import {
  formatMobileExploreChapterLabel,
  formatMobileNewChapterTag,
  getMobileExploreNewChapters,
  withoutMobileZeroVolume,
} from "./mobileContinueReadingCopy";
import { getMobileStrings } from "./mobileI18n";

const en = getMobileStrings("en");

describe("continue-reading copy", () => {
  test("new means released since the user last looked, never how far behind the reader is", () => {
    const link = (id: string, latest?: number, ack?: number) => ({
      id,
      latestChapter: latest === undefined ? undefined : { id: `l${latest}`, chapterNumber: latest },
      updateAckChapter: ack === undefined ? undefined : { id: `a${ack}`, chapterNumber: ack },
    });
    expect(getMobileExploreNewChapters([link("m", 131, 131)], { sourceId: "m", lastReadNumber: 1 })).toBeNull();
    expect(getMobileExploreNewChapters([link("m", 133, 131)], { sourceId: "m", lastReadNumber: 1 })).toEqual({ count: 2 });
    expect(getMobileExploreNewChapters([link("m", 133, 129)], { sourceId: "m", lastReadNumber: 132 })).toEqual({ count: 1 });
    expect(getMobileExploreNewChapters([link("m", 5)], { sourceId: "m", lastReadNumber: 1 })).toBeNull();
    expect(getMobileExploreNewChapters([{ ...link("m", 9, 3), removed: true }])).toBeNull();
  });

  test("counts and labels: caps large counts, never shows a volume of 0", () => {
    expect(formatMobileNewChapterTag(12)).toBe("+12");
    expect(formatMobileNewChapterTag(1199)).toBe("999+");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 0, chapterNumber: 1 }, en)).toBe("Ch.1");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 3, chapterNumber: 12 }, en)).toBe("Vol.3 Ch.12");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 0, title: "Prologue" }, en)).toBe("Prologue");
    expect(formatMobileExploreChapterLabel({ id: "a", volumeNumber: 0 }, en)).toBeNull();
    const numbered = { id: "a", volumeNumber: 2, chapterNumber: 5 };
    expect(withoutMobileZeroVolume(numbered)).toBe(numbered);
  });
});
