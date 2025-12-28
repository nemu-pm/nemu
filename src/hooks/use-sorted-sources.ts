import { useMemo } from "react";
import type { LocalSourceLink } from "@/data/schema";

/**
 * Sort sources by sourceOrder (UI concern, not data layer).
 * Sources in sourceOrder come first (in order), then remaining by createdAt.
 */
export function useSortedSources(
  sources: LocalSourceLink[],
  sourceOrder: string[] | undefined
): LocalSourceLink[] {
  return useMemo(() => {
    if (!sourceOrder || sourceOrder.length === 0) return sources;
    
    const orderMap = new Map(sourceOrder.map((id, idx) => [id, idx]));
    return [...sources].sort((a, b) => {
      const aIdx = orderMap.get(a.id);
      const bIdx = orderMap.get(b.id);
      if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
      if (aIdx !== undefined) return -1;
      if (bIdx !== undefined) return 1;
      return a.createdAt - b.createdAt;
    });
  }, [sources, sourceOrder]);
}

/**
 * Pure function version for non-hook contexts.
 */
export function sortSourcesByOrder(
  sources: LocalSourceLink[],
  sourceOrder: string[] | undefined
): LocalSourceLink[] {
  if (!sourceOrder || sourceOrder.length === 0) return sources;
  
  const orderMap = new Map(sourceOrder.map((id, idx) => [id, idx]));
  return [...sources].sort((a, b) => {
    const aIdx = orderMap.get(a.id);
    const bIdx = orderMap.get(b.id);
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
    if (aIdx !== undefined) return -1;
    if (bIdx !== undefined) return 1;
    return a.createdAt - b.createdAt;
  });
}

