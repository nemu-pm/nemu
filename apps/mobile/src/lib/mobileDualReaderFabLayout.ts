import type { WindowLayoutEdgeInsets, WindowLayoutRect } from "@/lib/mobileWindowLayout";

/**
 * Where the dual-reader FAB may rest, per reader pose. It must never sit on
 * the capsule rows, on the fold, or over the notebook console: it lives over
 * the page it controls.
 *
 * - capsule chrome (regular width, book): the page region between the
 *   capsule row and the scrubber capsule;
 * - notebook: the page (top) pane;
 * - otherwise the reader-card frame (the chrome pane in book posture, the
 *   stage beside a docked panel, the window elsewhere), inside the safe area.
 */
export function mobileDualReaderFabArea(input: {
  chrome: { kind: "horizontal" | "capsules" | "console"; content?: WindowLayoutRect };
  stage: WindowLayoutRect;
  modalFrame: WindowLayoutRect;
  bounds: WindowLayoutRect;
  safeInsets: WindowLayoutEdgeInsets;
}): WindowLayoutRect {
  const { chrome, bounds, safeInsets } = input;
  if (chrome.kind === "capsules" && chrome.content) return chrome.content;
  const frame = chrome.kind === "console" ? input.stage : input.modalFrame;
  const touches = {
    top: frame.y <= bounds.y + 0.5,
    left: frame.x <= bounds.x + 0.5,
    bottom: frame.y + frame.height >= bounds.y + bounds.height - 0.5,
    right: frame.x + frame.width >= bounds.x + bounds.width - 0.5,
  };
  const top = touches.top ? safeInsets.top : 0;
  const left = touches.left ? safeInsets.left : 0;
  const bottom = touches.bottom ? safeInsets.bottom : 0;
  const right = touches.right ? safeInsets.right : 0;
  return {
    x: frame.x + left,
    y: frame.y + top,
    width: Math.max(0, frame.width - left - right),
    height: Math.max(0, frame.height - top - bottom),
  };
}

export type MobileDualReaderFabPlacement = { x: number; y: number; side: "left" | "right" };

/** Keep the FAB on its side's edge of `area`, vertically inside it. */
export function mobileDualReaderFabClamp(
  pos: MobileDualReaderFabPlacement,
  area: WindowLayoutRect,
  size: number,
  margin: number,
): MobileDualReaderFabPlacement {
  "worklet";
  const minX = area.x + margin;
  const maxX = Math.max(minX, area.x + area.width - margin - size);
  const minY = area.y + margin;
  const maxY = Math.max(minY, area.y + area.height - margin - size);
  return {
    x: pos.side === "left" ? minX : maxX,
    y: Math.max(minY, Math.min(maxY, pos.y)),
    side: pos.side,
  };
}

/** Drag release: snap to the nearer edge of `area`. */
export function mobileDualReaderFabSnap(
  pos: { x: number; y: number },
  area: WindowLayoutRect,
  size: number,
  margin: number,
): MobileDualReaderFabPlacement {
  "worklet";
  const side = pos.x + size / 2 < area.x + area.width / 2 ? "left" : "right";
  return mobileDualReaderFabClamp({ x: pos.x, y: pos.y, side }, area, size, margin);
}

export function mobileDualReaderFabDefault(
  area: WindowLayoutRect,
  size: number,
  margin: number,
): MobileDualReaderFabPlacement {
  return mobileDualReaderFabClamp(
    { x: 0, y: area.y + Math.round(area.height * 0.4), side: "right" },
    area,
    size,
    margin,
  );
}
