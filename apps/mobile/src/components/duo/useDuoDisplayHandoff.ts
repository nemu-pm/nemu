/**
 * `useDuoDisplayHandoff` — feeds window geometry into
 * `mobileDuoDisplayTransition` and exposes the handoff to show for
 * `durationMs` (default 1.5 s). Geometry is tracked even while `enabled` is
 * false so a change made while the reader was hidden is never replayed.
 */
import { useEffect, useRef, useState } from "react";
import type { WindowHingeStatus } from "@/lib/mobileWindowLayout";
import {
  MOBILE_DUO_HANDOFF_TOAST_MS,
  mobileDuoDisplayTransition,
  type MobileDuoDisplay,
  type MobileDuoDisplayState,
} from "@/lib/mobileDuoDisplayTransition";

export type DuoDisplayHandoff = { display: MobileDuoDisplay; id: number };

/** Tracks display changes; returns the handoff to show (null when none). */
export function useDuoDisplayHandoff({
  width,
  height,
  hinge,
  hasFold = false,
  enabled,
  durationMs = MOBILE_DUO_HANDOFF_TOAST_MS,
}: {
  width: number;
  height: number;
  hinge: WindowHingeStatus | null | undefined;
  /** The window reports a fold division (e.g. `readerWindowLayout.divisions.length > 0`). */
  hasFold?: boolean;
  enabled: boolean;
  durationMs?: number;
}): DuoDisplayHandoff | null {
  const stateRef = useRef<MobileDuoDisplayState | null>(null);
  const idRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [handoff, setHandoff] = useState<DuoDisplayHandoff | null>(null);

  useEffect(() => {
    const result = mobileDuoDisplayTransition(stateRef.current, { width, height, hinge: hinge ?? null, hasFold });
    stateRef.current = result.state;
    if (!result.handoff || !enabled) return;
    idRef.current += 1;
    const next = { display: result.handoff, id: idRef.current };
    // Deferred so the state update does not cascade out of this effect. Not
    // cancelled when the geometry updates again right after (fold angle /
    // safe area settle): the transition state has already moved on, so a
    // cancelled toast would never be emitted again.
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      setHandoff(next);
    }, 0);
  }, [enabled, hasFold, height, hinge, width]);

  useEffect(() => () => {
    if (pendingRef.current) clearTimeout(pendingRef.current);
  }, []);

  useEffect(() => {
    if (!handoff) return;
    const timer = setTimeout(() => {
      setHandoff((current) => (current?.id === handoff.id ? null : current));
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, handoff]);

  return handoff;
}
