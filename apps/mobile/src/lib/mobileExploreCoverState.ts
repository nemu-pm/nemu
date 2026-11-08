export type MobileExploreCoverState = "loading" | "loaded" | "failed";

/**
 * Which face a source cover shows: the loading tile until the image lands, the
 * titled book once there is nothing to wait for (no cover URL, or the load
 * failed). A failure outranks a late load event for the same source. A title
 * whose image has already shown keeps it (`imageHeld`), failure or not.
 */
export function resolveMobileExploreCoverState(input: {
  hasSource: boolean;
  loaded: boolean;
  failed: boolean;
  imageHeld?: boolean;
}): MobileExploreCoverState {
  if (input.hasSource && input.imageHeld) return "loaded";
  if (!input.hasSource || input.failed) return "failed";
  return input.loaded ? "loaded" : "loading";
}
