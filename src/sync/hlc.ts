/**
 * Hybrid Logical Clock (HLC) Implementation
 *
 * HLC provides a total ordering of events across distributed devices that:
 * - Works offline (no central coordination needed)
 * - Respects user action order better than server "receipt time"
 * - Allows convergence without central sequencing
 *
 * IntentClock format (lexicographically comparable string):
 * "{wallMsPadded}:{counterPadded}:{nodeId}"
 *
 * Example: "00001703497912345:000012:device-9f3c"
 *
 * The clock advances in two ways:
 * 1. On local event: increment counter, update wallMs to max(wallMs, now)
 * 2. On receiving remote clock: take max of both components, increment counter
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * IntentClock is a lexicographically comparable string representing an HLC timestamp.
 * Format: "{wallMsPadded}:{counterPadded}:{nodeId}"
 */
export type IntentClock = string;

/**
 * Internal HLC state structure
 */
export interface HLCState {
  /** Wall clock milliseconds (padded to 17 digits for year ~2100 support) */
  wallMs: number;
  /** Logical counter (resets when wallMs advances) */
  counter: number;
  /** Unique node identifier for this device/profile */
  nodeId: string;
}

/**
 * Parsed IntentClock components
 */
export interface ParsedIntentClock {
  wallMs: number;
  counter: number;
  nodeId: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Padding width for wallMs (17 digits supports timestamps until year ~2100) */
const WALL_MS_PAD = 17;

/** Padding width for counter (6 digits = max 999999 events per ms, more than enough) */
const COUNTER_PAD = 6;

/** Maximum allowed drift from system clock (1 minute) */
const MAX_DRIFT_MS = 60_000;

/** Separator between clock components */
const SEP = ":";

// ============================================================================
// HLC CORE FUNCTIONS
// ============================================================================

/**
 * Generate a unique node ID for this device/session.
 * Uses crypto.randomUUID if available, otherwise falls back to random string.
 */
export function generateNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // Use first segment of UUID for brevity while maintaining uniqueness
    return crypto.randomUUID().split("-")[0];
  }
  // Fallback for older browsers
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Create a new HLC state with the given node ID.
 */
export function createHLCState(nodeId?: string): HLCState {
  return {
    wallMs: 0,
    counter: 0,
    nodeId: nodeId ?? generateNodeId(),
  };
}

/**
 * Format an HLC state as an IntentClock string.
 * The format is lexicographically comparable.
 */
export function formatIntentClock(state: HLCState): IntentClock {
  const wallMsStr = state.wallMs.toString().padStart(WALL_MS_PAD, "0");
  const counterStr = state.counter.toString().padStart(COUNTER_PAD, "0");
  return `${wallMsStr}${SEP}${counterStr}${SEP}${state.nodeId}`;
}

/**
 * Parse an IntentClock string into its components.
 * Returns null if the format is invalid.
 */
export function parseIntentClock(clock: IntentClock): ParsedIntentClock | null {
  if (!clock || typeof clock !== "string") return null;

  const parts = clock.split(SEP);
  if (parts.length < 3) return null;

  const wallMs = parseInt(parts[0], 10);
  const counter = parseInt(parts[1], 10);
  // NodeId may contain colons, so join remaining parts
  const nodeId = parts.slice(2).join(SEP);

  if (isNaN(wallMs) || isNaN(counter) || !nodeId) return null;

  return { wallMs, counter, nodeId };
}

/**
 * Compare two IntentClocks.
 * Returns:
 *   - negative if a < b
 *   - positive if a > b
 *   - 0 if a === b
 *
 * Since IntentClocks are lexicographically comparable strings,
 * this is equivalent to string comparison.
 */
export function compareIntentClocks(a: IntentClock, b: IntentClock): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Check if clock a is strictly greater than clock b.
 */
export function isClockNewer(a: IntentClock | null | undefined, b: IntentClock | null | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  return compareIntentClocks(a, b) > 0;
}

/**
 * Get the maximum (newest) of two clocks.
 */
export function maxClock(a: IntentClock | null | undefined, b: IntentClock | null | undefined): IntentClock | undefined {
  if (!a && !b) return undefined;
  if (!a) return b ?? undefined;
  if (!b) return a;
  return compareIntentClocks(a, b) >= 0 ? a : b;
}

// ============================================================================
// HLC STATE MANAGEMENT
// ============================================================================

/**
 * HLC manager class for maintaining clock state.
 * Each profile should have its own HLC instance.
 */
export class HLC {
  private state: HLCState;

  constructor(state?: HLCState) {
    this.state = state ?? createHLCState();
  }

  /**
   * Get the current state (for persistence).
   */
  getState(): HLCState {
    return { ...this.state };
  }

  /**
   * Get the node ID.
   */
  getNodeId(): string {
    return this.state.nodeId;
  }

  /**
   * Generate a new IntentClock for a local event.
   * This advances the clock and returns the new timestamp.
   */
  now(): IntentClock {
    const physicalNow = Date.now();

    if (physicalNow > this.state.wallMs) {
      // Wall clock advanced - reset counter
      this.state.wallMs = physicalNow;
      this.state.counter = 0;
    } else {
      // Wall clock hasn't advanced (same ms or clock went backward)
      // Just increment counter
      this.state.counter++;
    }

    return formatIntentClock(this.state);
  }

  /**
   * Receive a remote clock and update local state.
   * Returns the new local clock (which is guaranteed >= remote clock).
   *
   * This ensures:
   * 1. Any event created after receive() will have a clock > remoteClock
   * 2. The local clock never drifts too far from physical time
   */
  receive(remoteClock: IntentClock): IntentClock {
    const remote = parseIntentClock(remoteClock);
    if (!remote) {
      // Invalid remote clock, just generate a new local clock
      return this.now();
    }

    const physicalNow = Date.now();

    // Check for excessive drift
    if (remote.wallMs > physicalNow + MAX_DRIFT_MS) {
      // Remote clock is too far in the future - could be malicious or misconfigured
      // Ignore the remote wallMs and just advance our counter
      console.warn(
        `[HLC] Remote clock is ${remote.wallMs - physicalNow}ms in the future, ignoring wallMs`
      );
      this.state.counter = Math.max(this.state.counter, remote.counter) + 1;
      return formatIntentClock(this.state);
    }

    // Take the maximum of all three: local wallMs, remote wallMs, physical now
    const maxWallMs = Math.max(this.state.wallMs, remote.wallMs, physicalNow);

    if (maxWallMs === this.state.wallMs && maxWallMs === remote.wallMs) {
      // All same wallMs - take max counter and increment
      this.state.counter = Math.max(this.state.counter, remote.counter) + 1;
    } else if (maxWallMs === this.state.wallMs) {
      // Local wallMs is max - increment local counter
      this.state.counter++;
    } else if (maxWallMs === remote.wallMs) {
      // Remote wallMs is max - take remote counter and increment
      this.state.wallMs = remote.wallMs;
      this.state.counter = remote.counter + 1;
    } else {
      // Physical now is max - reset counter
      this.state.wallMs = maxWallMs;
      this.state.counter = 0;
    }

    return formatIntentClock(this.state);
  }

  /**
   * Update state from persisted data (e.g., loaded from IndexedDB).
   * Ensures we never go backward even if the persisted state is stale.
   */
  restore(persistedState: HLCState): void {
    // Keep the same nodeId
    this.state.nodeId = persistedState.nodeId;

    // Take max of persisted vs current physical time
    const physicalNow = Date.now();

    if (persistedState.wallMs > physicalNow) {
      // Persisted state is ahead (maybe clock changed) - use it but watch for drift
      if (persistedState.wallMs > physicalNow + MAX_DRIFT_MS) {
        console.warn(
          `[HLC] Persisted clock is ${persistedState.wallMs - physicalNow}ms in the future`
        );
        this.state.wallMs = physicalNow;
        this.state.counter = 0;
      } else {
        this.state.wallMs = persistedState.wallMs;
        this.state.counter = persistedState.counter;
      }
    } else if (persistedState.wallMs === physicalNow) {
      // Same ms - take the persisted counter
      this.state.counter = persistedState.counter;
      this.state.wallMs = physicalNow;
    } else {
      // Physical time is ahead - reset
      this.state.wallMs = physicalNow;
      this.state.counter = 0;
    }
  }
}

// ============================================================================
// MERGE HELPERS
// ============================================================================

/**
 * Merge a field value using IntentClock ordering.
 *
 * Merge rule:
 * - If incoming.clock > existing.clock: accept incoming value (including null)
 * - Else: keep existing value
 *
 * @param existingValue Current field value
 * @param existingClock Current field clock
 * @param incomingValue Incoming field value
 * @param incomingClock Incoming field clock
 * @returns Merged value and clock
 */
export function mergeFieldWithClock<T>(
  existingValue: T | null | undefined,
  existingClock: IntentClock | null | undefined,
  incomingValue: T | null | undefined,
  incomingClock: IntentClock | null | undefined
): { value: T | null | undefined; clock: IntentClock | undefined } {
  // IMPORTANT:
  // `undefined` means "not provided / never set", NOT an explicit user action.
  // The explicit clear value is `null`. Therefore we should never allow an incoming
  // `undefined` (even with a newer clock) to wipe an existing value.
  if (incomingValue === undefined) {
    return {
      value: existingValue,
      clock: existingClock ?? undefined,
    };
  }

  // If incoming clock is newer, accept incoming value
  if (isClockNewer(incomingClock, existingClock)) {
    return {
      value: incomingValue,
      clock: incomingClock ?? undefined,
    };
  }

  // Keep existing
  return {
    value: existingValue,
    clock: existingClock ?? undefined,
  };
}

/**
 * Merge library membership state using IntentClock.
 * This replaces the old deletedAt tombstone approach.
 */
export function mergeLibraryMembership(
  existingInLibrary: boolean,
  existingClock: IntentClock | null | undefined,
  incomingInLibrary: boolean,
  incomingClock: IntentClock | null | undefined
): { inLibrary: boolean; clock: IntentClock | undefined } {
  if (isClockNewer(incomingClock, existingClock)) {
    return {
      inLibrary: incomingInLibrary,
      clock: incomingClock ?? undefined,
    };
  }

  return {
    inLibrary: existingInLibrary,
    clock: existingClock ?? undefined,
  };
}

// ============================================================================
// ZERO CLOCK (for initialization)
// ============================================================================

/**
 * A zero clock value - older than any valid clock.
 * Use this as a default when no clock exists yet.
 */
export const ZERO_CLOCK: IntentClock = formatIntentClock({
  wallMs: 0,
  counter: 0,
  nodeId: "0",
});

