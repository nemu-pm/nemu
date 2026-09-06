/**
 * The metadata editor's text fields hold one logical line each (a title, a
 * URL, a comma list) but are rendered as growing multiline inputs so a long
 * value wraps into view instead of scrolling out of it. `Return` blurs those
 * fields rather than inserting a break, but a pasted value can still carry
 * newlines, and a real newline would grow the field for content the record can
 * never hold.
 */
export function stripMobileMetadataFieldNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}
