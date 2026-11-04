/**
 * Epoch milliseconds of a server timestamp, or undefined. Servers write ISO-8601
 * with up to seven fractional digits and sometimes no zone designator (.NET
 * local-less UTC); both are normalised so every JS engine parses the same value.
 */
export function parseServerDate(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("0001-")) return undefined;
  const truncated = trimmed.replace(/(\.\d{3})\d+/, "$1");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(truncated) || !/T/.test(truncated) ? truncated : `${truncated}Z`;
  const time = Date.parse(zoned);
  return Number.isFinite(time) ? time : undefined;
}
