import { useState, useEffect } from "react";

/**
 * Returns the visual scroll position clamped and normalized to 0…1
 * within the range [start, end].
 *
 * Handles the vaul position-fixed scroll lock the same way
 * useScrollPosition does.
 */
function readVisualScrollY(): number {
  const top = document.body.style.top;
  if (top && top.startsWith("-")) {
    const parsed = parseFloat(top);
    if (Number.isFinite(parsed)) return -parsed;
  }
  return window.scrollY;
}

export function useScrollProgress(start: number, end: number) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const y = readVisualScrollY();
      const clamped = Math.min(Math.max((y - start) / (end - start), 0), 1);
      setProgress(clamped);
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(handleScroll);
      observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [start, end]);

  return progress;
}
