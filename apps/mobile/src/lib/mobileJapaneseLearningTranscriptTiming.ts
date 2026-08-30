export type MobileTranscriptTimingLine = {
  order: number;
  text: string;
};

const IGNORABLE_TRANSCRIPT_CHAR_REGEX = /[\s\p{P}\p{S}]/u;

function countTranscriptTimingChars(text: string): number {
  let count = 0;
  for (const raw of Array.from(text)) {
    const normalized = raw.normalize("NFKC").toLowerCase();
    if (!normalized || IGNORABLE_TRANSCRIPT_CHAR_REGEX.test(normalized)) continue;
    count += 1;
  }
  return count;
}

export function findMobileTranscriptPlaybackLineOrder(
  lines: MobileTranscriptTimingLine[],
  currentTime: number,
  duration: number,
): number | null {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const weightedLines = lines
    .map((line) => ({
      order: line.order,
      weight: countTranscriptTimingChars(line.text),
    }))
    .filter((line) => line.weight > 0);
  const totalWeight = weightedLines.reduce((sum, line) => sum + line.weight, 0);
  if (totalWeight <= 0) return null;

  const clampedTime = Math.max(0, Math.min(duration, currentTime));
  if (clampedTime >= duration) {
    return weightedLines[weightedLines.length - 1]?.order ?? null;
  }

  let cursor = 0;
  for (const line of weightedLines) {
    const nextCursor = cursor + line.weight;
    const lineEndTime = (nextCursor / totalWeight) * duration;
    if (clampedTime <= lineEndTime) return line.order;
    cursor = nextCursor;
  }

  return weightedLines[weightedLines.length - 1]?.order ?? null;
}
