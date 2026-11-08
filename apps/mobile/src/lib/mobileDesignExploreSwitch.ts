/**
 * The design this run uses, for pure modules that cannot import
 * `react-native` (strings, chapter formatting). The boot module
 * (`mobileDesignExploreBoot`) records it once when the bundle starts: the
 * design on iOS, never on Android or web.
 */

// The value this run started with. Set once by the boot module; never
// changed while the app runs (module-scope readers have already read it).
let active: boolean | null = null;

/** Records the value the run starts with. Later calls are ignored. */
export function bootMobileDesignExplore(value: boolean): boolean {
  if (active === null) active = value;
  return active;
}

/** The value this run started with (false before the boot ran: plain tests, web). */
export function getMobileDesignExploreActive(): boolean {
  return active === true;
}
