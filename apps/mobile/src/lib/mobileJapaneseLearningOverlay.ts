import type { MobileOcrDetection } from "./mobileJapaneseLearningOcr";

export type MobileImageSize = {
  width: number;
  height: number;
};

export type MobileOverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type MobileCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function computeContainImageRect(
  container: MobileImageSize,
  image: MobileImageSize,
): MobileOverlayRect | null {
  if (
    container.width <= 0 ||
    container.height <= 0 ||
    image.width <= 0 ||
    image.height <= 0
  ) {
    return null;
  }

  const imageAspect = image.width / image.height;
  const containerAspect = container.width / container.height;
  const width =
    imageAspect > containerAspect ? container.width : container.height * imageAspect;
  const height =
    imageAspect > containerAspect ? container.width / imageAspect : container.height;

  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

export function computeMobileOcrDetectionRect(
  detection: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">,
  container: MobileImageSize,
  image: MobileImageSize,
): MobileOverlayRect | null {
  const containRect = computeContainImageRect(container, image);
  if (!containRect) return null;

  const x1 = Math.max(0, Math.min(image.width, detection.x1));
  const y1 = Math.max(0, Math.min(image.height, detection.y1));
  const x2 = Math.max(0, Math.min(image.width, detection.x2));
  const y2 = Math.max(0, Math.min(image.height, detection.y2));
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  if (right <= left || bottom <= top) return null;

  return {
    left: containRect.left + (left / image.width) * containRect.width,
    top: containRect.top + (top / image.height) * containRect.height,
    width: ((right - left) / image.width) * containRect.width,
    height: ((bottom - top) / image.height) * containRect.height,
  };
}

export function computeMobileOcrCropRect(
  detection: Pick<MobileOcrDetection, "x1" | "y1" | "x2" | "y2">,
  image: MobileImageSize,
  padding = 10,
): MobileCropRect | null {
  if (image.width <= 0 || image.height <= 0) return null;

  const x1 = Math.max(0, Math.min(image.width, detection.x1));
  const y1 = Math.max(0, Math.min(image.height, detection.y1));
  const x2 = Math.max(0, Math.min(image.width, detection.x2));
  const y2 = Math.max(0, Math.min(image.height, detection.y2));
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  if (right <= left || bottom <= top) return null;

  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  const width = Math.min(image.width - x, right - left + padding * 2);
  const height = Math.min(image.height - y, bottom - top + padding * 2);
  if (width <= 1 || height <= 1) return null;
  return { x, y, width, height };
}
