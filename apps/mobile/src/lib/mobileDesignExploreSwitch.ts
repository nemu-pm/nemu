/**
 * The "New design (preview)" switch (design-explore). The prototype is off
 * unless the reader turns it on in Settings → Experimental Design. The value is read
 * once, synchronously, when the bundle starts (`mobileDesignExploreBoot`),
 * before any screen or module-scope constant reads it, and holds for the
 * whole run: switching takes effect on the next launch (or a reload).
 *
 * iOS only: Android never gets the prototype and has no switch.
 *
 * Pure: no `react-native` import, so plain unit tests and pure modules
 * (chapter labels, the string catalogues) can read it.
 */

type MobileDesignExploreInputs = {
  platform: string | undefined;
  /** The reader's choice, or null when they never made one. */
  stored: boolean | null;
};

export function resolveMobileDesignExplore({ platform, stored }: MobileDesignExploreInputs): boolean {
  if (platform !== "ios") return false;
  return stored ?? false;
}

/** Whether the switch is offered at all on this platform. */
export function isMobileDesignExploreSwitchAvailable(platform: string | undefined): boolean {
  return platform === "ios";
}

/** The stored file: `{"designPreview":true}`. Anything else is \"no choice\". */
export function parseMobileDesignExploreStored(text: string | null | undefined): boolean | null {
  if (!text) return null;
  try {
    const value = (JSON.parse(text) as { designPreview?: unknown } | null)?.designPreview;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

export function serializeMobileDesignExploreStored(value: boolean): string {
  return JSON.stringify({ designPreview: value });
}

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
