export type MobileSourceHomeImageScrollerSize = {
  width?: number | null;
  height?: number | null;
};

const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 160;
const DEFAULT_ASPECT_RATIO = DEFAULT_WIDTH / DEFAULT_HEIGHT;
const MIN_WIDTH = 180;
const MAX_WIDTH = 340;
const MIN_HEIGHT = 96;
const MAX_HEIGHT = 190;

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getMobileSourceHomeImageScrollerCardSize(
  size: MobileSourceHomeImageScrollerSize,
): { width: number; height: number } {
  const rawWidth = finitePositive(size.width);
  const rawHeight = finitePositive(size.height);

  if (!rawWidth && !rawHeight) {
    return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }

  const aspectRatio =
    rawWidth && rawHeight ? rawWidth / rawHeight : DEFAULT_ASPECT_RATIO;

  let width: number;
  let height: number;

  if (rawWidth && rawHeight) {
    height = clamp(rawHeight, MIN_HEIGHT, MAX_HEIGHT);
    width = height * aspectRatio;
  } else if (rawWidth) {
    width = rawWidth;
    height = width / aspectRatio;
  } else {
    height = rawHeight ?? DEFAULT_HEIGHT;
    width = height * aspectRatio;
  }

  if (width > MAX_WIDTH) {
    width = MAX_WIDTH;
    height = width / aspectRatio;
  }

  if (width < MIN_WIDTH) {
    width = MIN_WIDTH;
    height = width / aspectRatio;
  }

  height = clamp(height, MIN_HEIGHT, MAX_HEIGHT);
  width = clamp(width, MIN_WIDTH, MAX_WIDTH);

  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}
