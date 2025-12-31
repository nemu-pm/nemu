/**
 * Source Selector - Glassmorphic horizontal scrolling source picker
 * 
 * Replaces tabs with a beautiful glass-panel selector that:
 * - Scrolls horizontally when many sources
 * - Shows source icon, name, chapter count
 * - Highlights chapter count when source has updates
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/haptics";

interface SourceInfo {
  name: string;
  icon?: string;
}

export interface SourceSelectorItem {
  id: string;
  sourceId: string;
  registryId: string;
}

interface SourceSelectorProps<T extends SourceSelectorItem> {
  sources: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  getSourceInfo: (source: T) => SourceInfo | undefined;
  getChapterCount: (source: T) => number | string | undefined;
  hasUpdate: (source: T) => boolean;
}

export function SourceSelector<T extends SourceSelectorItem>({
  sources,
  selectedIndex,
  onSelect,
  getSourceInfo,
  getChapterCount,
  hasUpdate,
}: SourceSelectorProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [scrollState, setScrollState] = useState({ atStart: true, atEnd: true });

  // Track scroll position for fade edges
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setScrollState({ atStart, atEnd });
  }, []);

  // Update scroll state on mount and resize
  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, sources.length]);

  // Scroll selected item into view when selection changes
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const selected = selectedRef.current;
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();

      // Check if selected is outside visible area
      if (selectedRect.left < containerRect.left) {
        selected.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      } else if (selectedRect.right > containerRect.right) {
        selected.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "end" });
      }
    }
  }, [selectedIndex]);

  return (
    <div
      className="source-selector-container"
      data-at-start={scrollState.atStart}
      data-at-end={scrollState.atEnd}
    >
      <div
        ref={scrollRef}
        className="source-selector-scroll"
      >
        <div className="source-selector-track">
          {sources.map((source, idx) => {
            const info = getSourceInfo(source);
            const chapterCount = getChapterCount(source);
            const isSelected = selectedIndex === idx;
            const showsUpdate = hasUpdate(source);

            return (
              <button
                key={source.id}
                ref={isSelected ? selectedRef : undefined}
                onClick={() => {
                  hapticSelection()
                  onSelect(idx)
                }}
                className={cn(
                  "source-selector-item",
                  isSelected && "source-selector-item-active"
                )}
                type="button"
              >
                {/* Source icon */}
                {info?.icon && (
                  <img
                    src={info.icon}
                    alt=""
                    className="source-selector-icon"
                  />
                )}

                {/* Source name */}
                <span className="source-selector-name">
                  {info?.name ?? source.sourceId}
                </span>

                {/* Chapter count badge - highlights when has update */}
                {chapterCount !== undefined && chapterCount !== null && (
                  <span
                    className={cn(
                      "source-selector-count",
                      showsUpdate && "source-selector-count-update"
                    )}
                  >
                    {chapterCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
