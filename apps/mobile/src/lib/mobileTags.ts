export const MOBILE_TAG_LIMIT = 10;

export type MobileTagPresentation = {
  key: string;
  label: string;
};

export function getMobileVisibleTags(
  tags: string[],
  limit: number = MOBILE_TAG_LIMIT,
): MobileTagPresentation[] {
  return tags.slice(0, limit).map((tag, index) => ({
    key: `${index}:${tag}`,
    label: tag,
  }));
}

export function getMobileTagOverflowCount(
  tags: string[],
  limit: number = MOBILE_TAG_LIMIT,
): number {
  return Math.max(0, tags.length - limit);
}
