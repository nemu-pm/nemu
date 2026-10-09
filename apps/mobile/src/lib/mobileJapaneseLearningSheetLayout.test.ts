import { describe, expect, test } from "bun:test";
import { japaneseLearningBubblePopoutMaxBottom } from "./mobileJapaneseLearningBubblePopout";
import {
  IOS_FLOATING_SHEET_INSET,
  isJapaneseLearningDrawerFullScreen,
  japaneseLearningDrawerIsFormSheet,
  JAPANESE_LEARNING_COLUMN_BUBBLE_MAX_HEIGHT,
  JAPANESE_LEARNING_COLUMN_BUBBLE_MIN_HEIGHT,
  JAPANESE_LEARNING_POPOUT_SHEET_GAP,
  JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION,
  resolveJapaneseLearningColumnBubbleMaxHeight,
  resolveJapaneseLearningDrawerContentBleed,
  resolveJapaneseLearningDrawerDetent,
  resolveJapaneseLearningFooterLayout,
  resolveJapaneseLearningSentenceLayout,
  resolveJapaneseLearningSheetBottomInset,
  resolveJapaneseLearningSheetIgnoredSafeAreaEdges,
} from "./mobileJapaneseLearningSheetLayout";

// Label widths measured on web (Inter 14/500) at 402pt: Listen, "Ask about
// this sentence", Copy.
const EN = { listenLabelWidth: 41, askLabelWidth: 161, copyLabelWidth: 36 };
const inner = (screen: number) => screen - 32;

describe("resolveJapaneseLearningFooterLayout", () => {
  test("wide sheets use web's equal thirds", () => {
    expect(resolveJapaneseLearningFooterLayout({ availableWidth: 700, ...EN }).equalWidths).toBe(true);
  });

  test("iPhone 17 Pro (402pt) keeps all three labels by tightening the ghost padding", () => {
    const layout = resolveJapaneseLearningFooterLayout({ availableWidth: inner(402), ...EN });
    expect(layout).toMatchObject({ equalWidths: false, ghostIconOnly: false, primaryPaddingX: 16 });
    expect(layout.ghostPaddingX).toBeLessThan(16);
  });

  test("375pt phones drop the ghost labels before the primary label wraps", () => {
    const layout = resolveJapaneseLearningFooterLayout({ availableWidth: inner(375), ...EN });
    expect(layout).toMatchObject({ ghostIconOnly: true, primaryPaddingX: 16, primaryScalesDown: false });
  });

  test("320pt windows tighten the primary padding and never overflow", () => {
    const layout = resolveJapaneseLearningFooterLayout({ availableWidth: inner(320), ...EN });
    expect(layout.ghostIconOnly).toBe(true);
    expect(layout.ghostIconOnlyWidth).toBe(32);
    expect(layout.primaryScalesDown).toBe(false);
  });

  test("scales the primary label only when nothing else is left", () => {
    const layout = resolveJapaneseLearningFooterLayout({ availableWidth: 200, ...EN });
    expect(layout).toMatchObject({ ghostIconOnly: true, primaryPaddingX: 12, primaryScalesDown: true });
  });

  test("before measuring, renders the web default", () => {
    expect(resolveJapaneseLearningFooterLayout({ availableWidth: 0, ...EN })).toMatchObject({
      equalWidths: false,
      ghostIconOnly: false,
      ghostPaddingX: 16,
    });
  });
});

describe("resolveJapaneseLearningDrawerDetent", () => {
  const IPHONE_17_PRO = {
    platform: "ios",
    isPad: false,
    windowWidth: 402,
    windowHeight: 874,
    safeAreaTop: 62,
    safeAreaBottom: 34,
  };
  /** Where iOS draws the floating sheet's top edge for a height detent. */
  function shownTop(
    detent: number,
    { windowWidth, windowHeight, safeAreaBottom }: typeof IPHONE_17_PRO,
  ) {
    const scale = (windowWidth - IOS_FLOATING_SHEET_INSET * 2) / windowWidth;
    return windowHeight - IOS_FLOATING_SHEET_INSET - (detent + safeAreaBottom) * scale;
  }

  test("opens an iPhone drawer with its top edge at web's 70vh drawer top", () => {
    const detent = resolveJapaneseLearningDrawerDetent(IPHONE_17_PRO);
    expect(detent).toBe(595);
    // Web: getBoundingClientRect top of the 70vh drawer at 402x874.
    expect(Math.abs(shownTop(detent as number, IPHONE_17_PRO) - 262.2)).toBeLessThan(1);
  });

  test("never asks for more than the largest detent", () => {
    const detent = resolveJapaneseLearningDrawerDetent({
      ...IPHONE_17_PRO,
      windowHeight: 500,
      safeAreaTop: 200,
      safeAreaBottom: 100,
    });
    expect(detent).toBe(200);
  });

  test("keeps web's percentage where the sheet is not an iPhone bottom drawer", () => {
    expect(resolveJapaneseLearningDrawerDetent({ ...IPHONE_17_PRO, platform: "android" })).toBe("70%");
    expect(resolveJapaneseLearningDrawerDetent({ ...IPHONE_17_PRO, isPad: true })).toBe("70%");
    expect(resolveJapaneseLearningDrawerDetent({ ...IPHONE_17_PRO, windowWidth: 0 })).toBe("70%");
  });
  test("opens a wide, short iPhone window's drawer up to just under the bubble popout", () => {
    // iPhone Duo inner display, flat landscape.
    const duo = { ...IPHONE_17_PRO, windowWidth: 951, windowHeight: 669, safeAreaTop: 24, safeAreaBottom: 20 };
    const detent = resolveJapaneseLearningDrawerDetent(duo);
    expect(typeof detent).toBe("number");
    const top = duo.windowHeight - IOS_FLOATING_SHEET_INSET - ((detent as number) + duo.safeAreaBottom);
    const popoutBottom = japaneseLearningBubblePopoutMaxBottom(duo);
    expect(top - popoutBottom).toBeCloseTo(JAPANESE_LEARNING_POPOUT_SHEET_GAP, 0);
    // Taller than web's 70% of the safe height.
    expect(detent as number).toBeGreaterThan((669 - 24 - 20) * 0.7);
  });

  test("fills a compact-height iPhone window, where UIKit shows the sheet full screen", () => {
    // iPhone 17 Pro in landscape.
    const phone = { ...IPHONE_17_PRO, windowWidth: 874, windowHeight: 402, safeAreaTop: 0, safeAreaBottom: 21 };
    expect(isJapaneseLearningDrawerFullScreen(phone)).toBe(true);
    expect(resolveJapaneseLearningDrawerDetent(phone)).toBe(402 - 21);
    // Portrait, iPad and the unfolded Duo keep a partial sheet.
    expect(isJapaneseLearningDrawerFullScreen(IPHONE_17_PRO)).toBe(false);
    expect(isJapaneseLearningDrawerFullScreen({ ...phone, isPad: true })).toBe(false);
    expect(isJapaneseLearningDrawerFullScreen({ ...phone, windowWidth: 951, windowHeight: 669 })).toBe(false);
    expect(isJapaneseLearningDrawerFullScreen({ ...phone, platform: "android" })).toBe(false);
  });

  test("never opens a wide drawer shorter than web's", () => {
    // A tall safe-area top pushes the popout down; web's 70% still wins.
    const duo = { ...IPHONE_17_PRO, windowWidth: 951, windowHeight: 669, safeAreaTop: 400, safeAreaBottom: 20 };
    expect(resolveJapaneseLearningDrawerDetent(duo)).toBe(Math.round((669 - 400 - 20) * 0.7));
  });

  test("bleeds the floating drawer's content to web's text column", () => {
    const detent = resolveJapaneseLearningDrawerDetent(IPHONE_17_PRO);
    const bleed = resolveJapaneseLearningDrawerContentBleed(detent);
    // The sheet is shown from x=8; its content from x=8-bleed. Web's 16pt
    // gutter then starts the text at x=16, as web's edge-attached drawer does.
    expect(IOS_FLOATING_SHEET_INSET - bleed + 16).toBe(16);
    expect(resolveJapaneseLearningDrawerContentBleed("70%")).toBe(0);
    // A landscape sheet is narrower than the window: no bleed.
    expect(resolveJapaneseLearningDrawerContentBleed(462, { width: 951, height: 669 })).toBe(0);
  });
});


describe("resolveJapaneseLearningSentenceLayout", () => {
  test("keeps web's stacked drawer on phones in portrait", () => {
    // iPhone 17 Pro body: 402 wide, ~530 between grabber and footer.
    expect(resolveJapaneseLearningSentenceLayout({ width: 402, height: 530 })).toBe("stacked");
    // A narrow landscape-ish body is still too narrow for two columns.
    expect(resolveJapaneseLearningSentenceLayout({ width: 560, height: 200 })).toBe("stacked");
  });

  test("keeps web's stacked drawer on portrait tablets", () => {
    expect(resolveJapaneseLearningSentenceLayout({ width: 704, height: 700 })).toBe("stacked");
  });

  test("splits wide and short bodies into columns", () => {
    // iPhone Duo inner display, flat landscape (sheet ~651 wide).
    expect(resolveJapaneseLearningSentenceLayout({ width: 651, height: 380 })).toBe("columns");
    // iPhone 17 Pro in landscape.
    expect(resolveJapaneseLearningSentenceLayout({ width: 760, height: 200 })).toBe("columns");
  });

  test("gives the sentence a little under half of the columns", () => {
    expect(JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION).toBeGreaterThanOrEqual(0.45);
    expect(JAPANESE_LEARNING_SENTENCE_COLUMN_FRACTION).toBeLessThan(0.5);
  });

  test("stays stacked until the body is measured", () => {
    expect(resolveJapaneseLearningSentenceLayout({ width: 0, height: 0 })).toBe("stacked");
    expect(resolveJapaneseLearningSentenceLayout({ width: 800, height: 0 })).toBe("stacked");
  });
});

describe("resolveJapaneseLearningColumnBubbleMaxHeight", () => {
  const chrome = 12 + 16 + 16 + 36;
  test("iPhone 17 Pro landscape: the bubble takes the details column at its full readable size", () => {
    // Full-window sheet on 874×402: ~283pt details column.
    expect(resolveJapaneseLearningColumnBubbleMaxHeight({ columnHeight: 283, chrome }))
      .toBe(JAPANESE_LEARNING_COLUMN_BUBBLE_MAX_HEIGHT);
  });

  test("iPhone SE landscape: shrinks to fit the shorter column", () => {
    const maxHeight = resolveJapaneseLearningColumnBubbleMaxHeight({ columnHeight: 240, chrome });
    expect(maxHeight).toBe(160);
  });

  test("never below the legible minimum (the column scrolls instead)", () => {
    expect(resolveJapaneseLearningColumnBubbleMaxHeight({ columnHeight: 150, chrome }))
      .toBe(JAPANESE_LEARNING_COLUMN_BUBBLE_MIN_HEIGHT);
  });

  test("unmeasured: the full size", () => {
    expect(resolveJapaneseLearningColumnBubbleMaxHeight({ columnHeight: 0, chrome }))
      .toBe(JAPANESE_LEARNING_COLUMN_BUBBLE_MAX_HEIGHT);
  });
});

describe("resolveJapaneseLearningSheetIgnoredSafeAreaEdges", () => {
  test("a floating iOS drawer lays its body out to its own bottom edge", () => {
    expect(resolveJapaneseLearningSheetIgnoredSafeAreaEdges({ platform: "ios", fullScreen: false, verticalBarEdge: null }))
      .toEqual(["bottom"]);
  });
  test("the Duo outer display also spans the vertical bar column", () => {
    expect(resolveJapaneseLearningSheetIgnoredSafeAreaEdges({ platform: "ios", fullScreen: false, verticalBarEdge: "trailing" }))
      .toEqual(["trailing", "bottom"]);
  });
  test("a full-window sheet keeps the vertical bar column (it holds the status bar)", () => {
    expect(resolveJapaneseLearningSheetIgnoredSafeAreaEdges({ platform: "ios", fullScreen: true, verticalBarEdge: "trailing" }))
      .toEqual(["bottom"]);
  });
  test("Android's Material sheet handles its own insets", () => {
    expect(resolveJapaneseLearningSheetIgnoredSafeAreaEdges({ platform: "android", fullScreen: false, verticalBarEdge: null }))
      .toBeUndefined();
  });
});

describe("resolveJapaneseLearningSheetBottomInset", () => {
  test("floating iOS drawers add nothing: the gap below the footer matches its padding", () => {
    expect(resolveJapaneseLearningSheetBottomInset({ platform: "ios", fullScreen: false, safeAreaBottom: 34 })).toBe(0);
  });
  test("the full-window landscape iPhone sheet keeps the home indicator's inset", () => {
    expect(resolveJapaneseLearningSheetBottomInset({ platform: "ios", fullScreen: true, safeAreaBottom: 21 })).toBe(21);
  });
  test("Android: Material already sits above the navigation bar", () => {
    expect(resolveJapaneseLearningSheetBottomInset({ platform: "android", fullScreen: false, safeAreaBottom: 24 })).toBe(0);
  });
});

describe("japaneseLearningDrawerIsFormSheet", () => {
  test("only a regular-width iPad window gets the centred form sheet", () => {
    expect(japaneseLearningDrawerIsFormSheet({ platform: "ios", idiomIsPad: true, windowWidth: 820 })).toBe(true);
    expect(japaneseLearningDrawerIsFormSheet({ platform: "ios", idiomIsPad: true, windowWidth: 1180 })).toBe(true);
  });

  test("an iPad in a narrow Split View column gets the phone's bottom drawer", () => {
    expect(japaneseLearningDrawerIsFormSheet({ platform: "ios", idiomIsPad: true, windowWidth: 507 })).toBe(false);
    expect(japaneseLearningDrawerIsFormSheet({ platform: "ios", idiomIsPad: true, windowWidth: 320 })).toBe(false);
  });

  test("the iPhone Duo's open display is regular width but keeps the bottom drawer", () => {
    expect(japaneseLearningDrawerIsFormSheet({ platform: "ios", idiomIsPad: false, windowWidth: 669 })).toBe(false);
    expect(japaneseLearningDrawerIsFormSheet({ platform: "ios", idiomIsPad: false, windowWidth: 951 })).toBe(false);
  });

  test("never off iOS", () => {
    expect(japaneseLearningDrawerIsFormSheet({ platform: "android", idiomIsPad: true, windowWidth: 900 })).toBe(false);
  });
});
