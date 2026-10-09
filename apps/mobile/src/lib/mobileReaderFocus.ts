/**
 * The reader's native sheets (learning sentence / transcript / chat, reader
 * and plugin settings, the Cloudflare check) present above the whole stack,
 * so they close when the reader stops being the focused screen. Only the
 * focused → unfocused edge counts: the reader mounts unfocused, and an
 * unrelated re-render while it stays unfocused must not close anything again.
 */
export function shouldDismissMobileReaderSurfacesOnFocusChange(
  wasFocused: boolean,
  focused: boolean,
): boolean {
  return wasFocused && !focused;
}
