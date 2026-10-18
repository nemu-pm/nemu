import { describe, expect, test } from "bun:test";
import {
  READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
  READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
  READER_SCRUBBER_PREVIEW_EDGE_INSET,
  READER_SCRUBBER_PREVIEW_THUMB_GAP,
  readerScrubberPreviewBubblePosition,
  readerScrubberCommitRatio,
  readerScrubberPreviewLabel,
  readerScrubberTrackWindowFrame,
} from "./mobileReaderScrubberPreview";
import { readerDisplayIndexForVisualProgressRatio } from "./mobileReaderProgress";
import {
  buildMobileReaderSpreads,
  firstPageIndexForMobileReaderSpread,
} from "./mobileReaderSpreads";
import { MOBILE_SLIDER_THUMB_SIZE, sliderRatioFromLocation } from "./mobileSliderTrack";

// A phone-sized reader: full-screen overlay, track inset inside the toolbar.
const layer = { x: 0, y: 0, width: 390, height: 844 };
const track = { x: 74, y: 760, width: 242, height: 44 };

function positionFor(
  ratio: number,
  overlay: typeof layer = layer,
  trackFrame: typeof track = track,
) {
  const position = readerScrubberPreviewBubblePosition({
    geometry: { ratio, track: trackFrame },
    layer: overlay,
  });
  if (!position) throw new Error("expected a bubble position");
  return position;
}

function leftFor(ratio: number) {
  return positionFor(ratio).left;
}

describe("readerScrubberPreviewBubblePosition", () => {
  test("centres the bubble on the thumb", () => {
    expect(leftFor(0.5)).toBe(
      track.x + track.width / 2 - READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH / 2,
    );
  });

  test("mirrors an RTL thumb because the caller passes a visual ratio", () => {
    const distanceFromLeft = leftFor(0.25) - layer.x;
    const distanceFromRight =
      layer.x +
      layer.width -
      (leftFor(0.75) + READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH);
    // Track is centred in the layer, so mirrored ratios are mirrored positions.
    expect(distanceFromLeft).toBeCloseTo(distanceFromRight, 5);
  });

  test("keeps the bubble on screen at both track extremes", () => {
    expect(leftFor(0)).toBeGreaterThanOrEqual(
      READER_SCRUBBER_PREVIEW_EDGE_INSET,
    );
    expect(leftFor(1) + READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH).toBeLessThanOrEqual(
      layer.width - READER_SCRUBBER_PREVIEW_EDGE_INSET,
    );
  });

  test("clamps out-of-range and non-finite ratios to the track ends", () => {
    expect(leftFor(-3)).toBe(leftFor(0));
    expect(leftFor(4)).toBe(leftFor(1));
    expect(leftFor(Number.NaN)).toBe(leftFor(0));
  });

  test("offsets the layer origin so a non-fullscreen overlay still lines up", () => {
    const inset = positionFor(0.5, { ...layer, x: 12, width: 366 });
    expect(inset.left).toBe(leftFor(0.5) - 12);
  });

  test("floats the bubble's bottom edge just above the thumb", () => {
    const { bottom } = positionFor(0.5);
    const thumbTop = track.y + (track.height - MOBILE_SLIDER_THUMB_SIZE) / 2;
    expect(layer.height - bottom).toBe(
      thumbTop - READER_SCRUBBER_PREVIEW_THUMB_GAP,
    );
    // The bubble grows upward from above the thumb, so the toolbar it floats
    // over can never clip it.
    expect(bottom).toBeGreaterThan(layer.height - thumbTop);
  });

  test("centres the bubble when the overlay is narrower than the insets", () => {
    expect(
      positionFor(1, { ...layer, width: READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH + 4 }).left,
    ).toBe(2);
  });

  // iPhone 17 Pro, iOS 26.5: 402x874pt overlay, bottom toolbar panel at window
  // {x:12, y:757, w:378, h:74}, slider track at {x:62, y:15, w:154, h:44}
  // inside that panel, i.e. thumb centre (131, 791) in window space.
  const simLayer = { x: 0, y: 0, width: 402, height: 874 };
  const simPanel = { x: 12, y: 757, width: 378, height: 74 };
  const trackInPanel = { x: 62, y: 15, width: 154, height: 44 };
  const simTrack = {
    x: simPanel.x + trackInPanel.x,
    y: simPanel.y + trackInPanel.y,
    width: trackInPanel.width,
    height: trackInPanel.height,
  };
  const simRatio = (131 - simTrack.x) / simTrack.width;

  test("lands over the thumb on the reported simulator geometry", () => {
    const sim = positionFor(simRatio, simLayer, simTrack);
    const thumbCentreY = simTrack.y + simTrack.height / 2;
    expect(thumbCentreY).toBe(794);
    // Centred on the thumb, bottom edge a few points above it: the bubble
    // overlaps the toolbar's top edge instead of being clipped inside it.
    expect(sim.left + READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH / 2).toBe(131);
    expect(simLayer.height - sim.bottom).toBe(779);
    expect(
      simLayer.height - sim.bottom - READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
    ).toBe(779 - READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT);
  });

  test("refuses a track frame measured in an embedded surface's space", () => {
    // What the Liquid Glass toolbar can report: the track's box within the
    // panel, which would put the badge on the status bar. Without the panel
    // anchor to resolve it, the overlay draws nothing rather than guessing.
    expect(
      readerScrubberPreviewBubblePosition({
        geometry: { ratio: simRatio, track: trackInPanel },
        layer: simLayer,
      }),
    ).toBeNull();
  });

  test("a panel-resolved track frame lands in the same place as a window one", () => {
    const resolved = readerScrubberTrackWindowFrame({
      track: trackInPanel,
      panel: simPanel,
    });
    expect(resolved).toEqual(simTrack);
    expect(positionFor(simRatio, simLayer, resolved)).toEqual(
      positionFor(simRatio, simLayer, simTrack),
    );
  });

  test("a window-space touch box taller than its capsule stays in window space", () => {
    // Capsule chrome: 48pt glass capsule, 60pt slider touch box centred on it.
    const capsule = { x: 12, y: 800, width: 180, height: 48 };
    const touchBox = { x: 68, y: 794, width: 76, height: 60 };
    expect(readerScrubberTrackWindowFrame({ track: touchBox, panel: capsule })).toEqual(touchBox);
    expect(
      readerScrubberPreviewBubblePosition({
        geometry: { ratio: 0.5, track: touchBox },
        layer: { x: 0, y: 0, width: 402, height: 874 },
      }),
    ).not.toBeNull();
  });

  test("leaves an already window-space track frame alone", () => {
    // The plain (Android / no-glass) panel measures in window space already.
    expect(
      readerScrubberTrackWindowFrame({ track: simTrack, panel: simPanel }),
    ).toEqual(simTrack);
    expect(
      readerScrubberTrackWindowFrame({ track: simTrack, panel: null }),
    ).toEqual(simTrack);
    expect(
      readerScrubberTrackWindowFrame({
        track: simTrack,
        panel: { ...simPanel, width: 0, height: 0 },
      }),
    ).toEqual(simTrack);
  });

  test("draws nothing when the overlay is not a laid-out full-screen layer", () => {
    expect(
      readerScrubberPreviewBubblePosition({
        geometry: { ratio: simRatio, track: simTrack },
        layer: { ...simLayer, height: 0 },
      }),
    ).toBeNull();
    expect(
      readerScrubberPreviewBubblePosition({
        geometry: { ratio: simRatio, track: simTrack },
        layer: { ...simLayer, width: 0, height: 0 },
      }),
    ).toBeNull();
  });
});

describe("scrub preview target page", () => {
  // The chain the scrubber runs while dragging: thumb ratio → scrub index
  // (page, or spread when two-up) → previewed page → bubble caption.
  function previewCaption({
    ratio,
    pageCount,
    mode,
    spreads,
  }: {
    ratio: number;
    pageCount: number;
    mode: "ltr" | "rtl";
    spreads?: number[][];
  }) {
    const scrubCount = spreads ? spreads.length : pageCount;
    const scrubIndex = readerDisplayIndexForVisualProgressRatio(ratio, scrubCount, mode);
    const pageIndex = spreads
      ? firstPageIndexForMobileReaderSpread(spreads, scrubIndex)
      : scrubIndex;
    return readerScrubberPreviewLabel(pageIndex, pageCount, mode);
  }

  test("LTR: the left end is page 1, the right end the last page", () => {
    expect(previewCaption({ ratio: 0, pageCount: 53, mode: "ltr" })).toBe("1 / 53");
    expect(previewCaption({ ratio: 1, pageCount: 53, mode: "ltr" })).toBe("53 / 53");
    expect(previewCaption({ ratio: 0.5, pageCount: 53, mode: "ltr" })).toBe("27 / 53");
  });

  test("RTL: the scale is mirrored — the right end is page 1", () => {
    expect(previewCaption({ ratio: 1, pageCount: 53, mode: "rtl" })).toBe("1 / 53");
    expect(previewCaption({ ratio: 0, pageCount: 53, mode: "rtl" })).toBe("53 / 53");
  });

  test("clamps a thumb dragged past either end", () => {
    expect(previewCaption({ ratio: -0.4, pageCount: 21, mode: "ltr" })).toBe("1 / 21");
    expect(previewCaption({ ratio: 1.7, pageCount: 21, mode: "ltr" })).toBe("21 / 21");
    expect(previewCaption({ ratio: Number.NaN, pageCount: 21, mode: "rtl" })).toBe("21 / 21");
  });

  test("spreads preview the spread's first page", () => {
    // Manga pairing: [0] [1,2] [3,4] [5]
    const spreads = buildMobileReaderSpreads(6, "manga");
    expect(previewCaption({ ratio: 0, pageCount: 6, mode: "ltr", spreads })).toBe("1 / 6");
    expect(previewCaption({ ratio: 1 / 3, pageCount: 6, mode: "ltr", spreads })).toBe("2 / 6");
    expect(previewCaption({ ratio: 1, pageCount: 6, mode: "ltr", spreads })).toBe("6 / 6");
    expect(previewCaption({ ratio: 1, pageCount: 6, mode: "rtl", spreads })).toBe("1 / 6");
  });
});

describe("scrub release commits the previewed page", () => {
  // Touch x on the slider's touch box → visual ratio → scrub index → page.
  function pageForTouch(locationX: number, trackWidth: number, pageCount: number, mode: "ltr" | "rtl") {
    const ratio = sliderRatioFromLocation(locationX, trackWidth);
    if (ratio == null) throw new Error("no track");
    return readerDisplayIndexForVisualProgressRatio(ratio, pageCount, mode) + 1;
  }

  test("a release at a known point lands on that page, LTR and RTL", () => {
    // 76pt track (compact iPhone capsule), 21 pages.
    expect(pageForTouch(70, 76, 21, "rtl")).toBe(3);
    expect(pageForTouch(70, 76, 21, "ltr")).toBe(19);
    expect(pageForTouch(0, 76, 21, "rtl")).toBe(21);
    expect(pageForTouch(76, 76, 21, "rtl")).toBe(1);
    expect(pageForTouch(38, 76, 21, "ltr")).toBe(11);
  });

  test("the commit uses the ratio the bubble last showed", () => {
    expect(readerScrubberCommitRatio({ releaseRatio: 0.52, lastPreviewRatio: 0.49 })).toBe(0.49);
    expect(readerScrubberCommitRatio({ releaseRatio: 0.52, lastPreviewRatio: null })).toBe(0.52);
    // Tap to jump: grant previews the tapped point, release commits it.
    const tapRatio = 0.25;
    expect(
      readerDisplayIndexForVisualProgressRatio(
        readerScrubberCommitRatio({ releaseRatio: tapRatio, lastPreviewRatio: tapRatio }),
        21,
        "ltr",
      ),
    ).toBe(5);
  });
});
