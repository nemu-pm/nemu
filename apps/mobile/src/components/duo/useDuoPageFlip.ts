/**
 * `useDuoPageFlip` — owns the active half-page flip request for
 * `DuoPageFlipOverlay`. `start` returns false under Reduce Motion (then page
 * normally); a safety timer clears a flip whose animation never reported back.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "react-native-reanimated";
import type { WindowLayoutRect } from "@/lib/mobileWindowLayout";
import {
  MOBILE_DUO_PAGE_FLIP_DURATION_MS,
  type MobileDuoPageFlipPlan,
} from "@/lib/mobileDuoSpine";

export type DuoPageFlipRequest = {
  id: number;
  plan: MobileDuoPageFlipPlan;
  /** Left/right page slots (or panes) in the overlay's local coordinates. */
  panes: { left: WindowLayoutRect; right: WindowLayoutRect };
  /** Old page on the side that lifts off. */
  outgoing: ReactNode;
  /** New page on the side it lands on. */
  incoming: ReactNode;
  /** Old page on the landing side, kept until the leaf covers it. */
  under?: ReactNode;
  /** Leaf backing colour (the stage colour); default black. */
  backgroundColor?: string;
};

export function useDuoPageFlip(durationMs = MOBILE_DUO_PAGE_FLIP_DURATION_MS) {
  const reduceMotion = useReducedMotion();
  const [flip, setFlip] = useState<DuoPageFlipRequest | null>(null);
  const nextId = useRef(1);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((id?: number) => {
    setFlip((current) => (current && (id == null || current.id === id) ? null : current));
  }, []);

  const start = useCallback(
    (request: Omit<DuoPageFlipRequest, "id">): boolean => {
      if (reduceMotion) return false;
      const id = nextId.current++;
      setFlip({ ...request, id });
      // If the animation is interrupted (unmount, cancelled worklet), never
      // leave a stale leaf over the new spread.
      if (safetyTimer.current) clearTimeout(safetyTimer.current);
      // Covers the overlay's optional pause while its leaves decode (≤ 300 ms).
      safetyTimer.current = setTimeout(() => finish(id), durationMs + 600);
      return true;
    },
    [durationMs, finish, reduceMotion],
  );

  useEffect(() => () => {
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
  }, []);

  return { flip, start, finish, reduceMotion };
}
