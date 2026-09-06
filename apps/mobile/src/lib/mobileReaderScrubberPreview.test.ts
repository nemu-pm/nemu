import { describe, expect, test } from "bun:test";
import {
  READER_SCRUBBER_PREVIEW_BUBBLE_HEIGHT,
  READER_SCRUBBER_PREVIEW_BUBBLE_WIDTH,
  READER_SCRUBBER_PREVIEW_EDGE_INSET,
  READER_SCRUBBER_PREVIEW_THUMB_GAP,
  readerScrubberPreviewBubblePosition,
  readerScrubberTrackWindowFrame,
} from "./mobileReaderScrubberPreview";
import { MOBILE_SLIDER_THUMB_SIZE } from "./mobileSliderTrack";

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
    expect(positionFor(1, { ...layer, width: 64 }).left).toBe(2);
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
    ).toBe(681);
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
